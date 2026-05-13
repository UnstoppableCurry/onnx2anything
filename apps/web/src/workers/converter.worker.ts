/// <reference lib="webworker" />

declare const __PYODIDE_VERSION__: string;

import type { RuntimeFormatMap } from '../lib/formats';
import {
  MAX_MODEL_FILE_SIZE_BYTES,
  getModelSizeLimitMessage,
} from '../lib/modelLimits';
import { ensureEdgeToolchains } from './edgeToolchains';
import type {
  ToolchainManifestEntry,
  ToolchainModuleContext,
  ToolchainRegistration,
} from '../types/toolchains';
import {
  fetchToolchainManifest,
  getToolchainRuntimeBlockReason,
} from '../utils/toolchains';

interface WorkerPyodide {
  loadPackage: (packages: string | string[]) => Promise<unknown>;
  runPythonAsync: (code: string) => Promise<unknown>;
  runPythonSync: (code: string) => any;
  FS: {
    writeFile: (path: string, data: string) => void;
  };
  registerJsModule: (name: string, module: Record<string, unknown>) => void;
}

interface ConversionMessage {
  type: 'convert' | 'validate' | 'analyze' | 'simplify' | 'init';
  modelBuffer?: ArrayBuffer;
  targetFormat?: string;
  quantization?: string;
  optimization?: boolean;
  options?: Record<string, any>;
}

interface ProgressMessage {
  type: 'progress';
  stage: string;
  percent: number;
  message: string;
}

interface ResultMessage {
  type: 'result' | 'error' | 'ready';
  buffer?: ArrayBuffer;
  result?: any;
  error?: string;
  filename?: string;
  warning?: string;
}

let pyodide: WorkerPyodide | null = null;
let isLoading = false;
let runtimeFormats: RuntimeFormatMap = {};
let loadPyodidePromise: Promise<
  (options: Record<string, unknown>) => Promise<WorkerPyodide>
> | null = null;
const runtimeToolchains = new Map<
  string,
  (modelInput: string | Uint8Array, optionsJson: string) => string | Promise<string>
>();
let manifestPromise: Promise<ToolchainManifestEntry[]> | null = null;
let conversionInFlight = false;

// Dependency loading status tracking
interface DependencyStatus {
  name: string;
  status: 'pending' | 'loading' | 'loaded' | 'error';
  error?: string;
}
let dependencyStatus: DependencyStatus[] = [];

async function importPublicModule(moduleUrl: string): Promise<Record<string, unknown>> {
  if (!moduleUrl.startsWith('/toolchains/')) {
    return (await import(/* @vite-ignore */ moduleUrl)) as Record<string, unknown>;
  }

  const response = await fetch(moduleUrl, {
    headers: { Accept: 'text/javascript, application/javascript, text/plain' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch toolchain module ${moduleUrl}: ${response.status}`);
  }

  const sourceText = await response.text();
  const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(sourceText)}`;
  return (await import(/* @vite-ignore */ dataUrl)) as Record<string, unknown>;
}

// Preload packages list
const PRELOAD_PACKAGES = ['micropip'];

// Python dependencies and their loading configuration
const PYTHON_DEPENDENCIES = [
  { name: 'onnx', version: '>=1.15.0', critical: true },
  { name: 'onnxsim', version: '>=0.4.0', critical: true },
  { name: 'numpy', version: '>=1.24.0', critical: true },
  { name: 'protobuf', version: '>=3.20.0', critical: true },
  // Optional dependencies
  { name: 'onnx2tf', version: '>=1.20.0', critical: false },
  { name: 'tensorflow-cpu', version: '>=2.15.0', critical: false },
];

type BridgeOutput = {
  success: boolean;
  output_base64?: string;
  output_filename?: string;
  output_mime?: string;
  param_base64?: string;
  bin_base64?: string;
  warning?: string;
  error?: string;
};

const OOM_ERROR_PATTERNS = [
  /out of memory/i,
  /memory access out of bounds/i,
  /cannot enlarge memory/i,
  /allocation failed/i,
  /oom/i,
];

function isLikelyOutOfMemoryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return OOM_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function getNativeFallbackHint(formatId: string): string | undefined {
  switch (formatId) {
    case 'mnn':
      return '可改用 `npm run export:mnn:auto -- <baseUrl> <modelPath> <outPath>` 自动切到容器内 native MNNConvert。';
    case 'openvino':
      return '可改用 `npm run export:openvino:native -- <modelPath> <outPath>` 走 native OpenVINO 导出。';
    case 'paddlelite':
      return '可改用 `npm run export:paddlelite:native -- <modelPath> <outPath>` 走 native Paddle Lite 导出。';
    case 'tflite':
      return '可改用 `npm run export:tflite:native -- <modelPath> <outPath>` 走 native TFLite 导出。';
    default:
      return undefined;
  }
}

function formatConversionError(formatId: string, error: string): string {
  const fallbackHint = getNativeFallbackHint(formatId);

  if (formatId === 'ncnn' && /divide by zero/i.test(error)) {
    return [
      '当前这个 ONNX 模型无法通过 NCNN 浏览器转换链。',
      '',
      '底层 onnx2ncnn 在处理该模型时触发了 `divide by zero`，这通常是模型结构/算子兼容性问题，不是你操作错了。',
      '',
      '建议：',
      '1. 先改用 MNN（这个模型已实测可转）',
      '2. 若必须导出 NCNN，优先尝试 pnnx / native NCNN 工具链',
    ].join('\n');
  }

  if (isLikelyOutOfMemoryError(error) && fallbackHint) {
    return `${error}\n\n检测到浏览器侧可能发生 OOM。${fallbackHint}`;
  }

  if (fallbackHint && formatId !== 'mnn') {
    return `${error}\n\n如需继续转换，${fallbackHint}`;
  }

  return error;
}


function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(buffer));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

let crcTable: Uint32Array | null = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[i] = c >>> 0;
  }
  return crcTable;
}

function crc32(bytes: Uint8Array) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeUtf8(text: string) {
  return new TextEncoder().encode(text);
}

function concatBytes(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function createZip(entries: Array<{ name: string; data: Uint8Array }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encodeUtf8(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);

    localParts.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(42, offset, true);

    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);

  return concatBytes([...localParts, centralDirectory, endHeader]);
}

async function getLoadPyodide() {
  if (!loadPyodidePromise) {
    const pyodideModuleUrl = new URL('/pyodide/pyodide.mjs', self.location.origin).toString();
    loadPyodidePromise = import(
      /* @vite-ignore */ pyodideModuleUrl
    ).then((module) => {
      if (typeof module.loadPyodide !== 'function') {
        throw new Error('Browser pyodide module did not export loadPyodide().');
      }

      return module.loadPyodide as (options: Record<string, unknown>) => Promise<WorkerPyodide>;
    });
  }

  return loadPyodidePromise;
}

function registerRuntimeToolchain(toolchain: ToolchainRegistration): void {
  runtimeToolchains.set(toolchain.id, toolchain.convert);
}

async function getToolchainManifest(): Promise<ToolchainManifestEntry[]> {
  if (!manifestPromise) {
    manifestPromise = fetchToolchainManifest()
      .then((manifest) => manifest.toolchains ?? [])
      .catch(() => []);
  }

  return manifestPromise;
}

async function ensureRuntimeToolchainLoaded(formatId: string): Promise<void> {
  if (runtimeToolchains.has(formatId)) {
    return;
  }

  const manifest = await getToolchainManifest();
  const entry = manifest.find((item) => item.id === formatId);

  if (!entry) {
    throw new Error(
      `Toolchain "${formatId}" is not declared in /toolchains/manifest.json.`
    );
  }

  if (entry.runtime !== 'wasm-module') {
    return;
  }

  const runtimeBlockReason = getToolchainRuntimeBlockReason(entry);
  if (runtimeBlockReason) {
    throw new Error(runtimeBlockReason);
  }

  if (!entry.moduleUrl) {
    throw new Error(
      `Toolchain "${formatId}" is missing moduleUrl in the manifest.`
    );
  }

  try {
    const probe = await fetch(entry.moduleUrl, { method: 'HEAD' });
    if (!probe.ok) {
      throw new Error(`${entry.moduleUrl} returned ${probe.status}`);
    }
  } catch (error) {
    throw new Error(
      entry.runtimeReason ||
        entry.notes?.[0] ||
        `${entry.label} 的浏览器模块尚未就绪: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const loadedModule = await importPublicModule(entry.moduleUrl);
  const registerName = entry.register ?? 'registerOnnx2AnythingToolchain';
  const registerFn = loadedModule[registerName] ?? loadedModule.default;

  if (typeof registerFn !== 'function') {
    throw new Error(
      `Toolchain module "${formatId}" did not export ${registerName}().`
    );
  }

  const context: ToolchainModuleContext = {
    register: registerRuntimeToolchain,
  };

  await Promise.resolve(
    (registerFn as (context: ToolchainModuleContext) => unknown)(context)
  );
}

async function convertWithRuntimeToolchain(
  formatId: string,
  modelInput: string | Uint8Array,
  optionsJson: string
): Promise<string> {
  const converter = runtimeToolchains.get(formatId);

  if (!converter) {
    return JSON.stringify({
      success: false,
      error: `Toolchain "${formatId}" is not loaded in the worker runtime.`,
    } satisfies BridgeOutput);
  }

  try {
    const raw = await converter(modelInput, optionsJson);
    return JSON.stringify(JSON.parse(raw));
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies BridgeOutput);
  }
}

function callStrictToolchain(
  key: 'ncnnConvert' | 'mnnConvert' | 'openvinoConvert' | 'paddleliteConvert' | 'tnnConvert',
  formatName: string,
  modelInput: string | Uint8Array,
  optionsJson: string
): string {
  const toolchains = (self as unknown as { __onnx2anythingToolchains?: Record<string, unknown> }).__onnx2anythingToolchains;
  const converter = toolchains?.[key];

  if (typeof converter !== 'function') {
    return JSON.stringify({
      success: false,
      error: `${formatName} wasm toolchain is not loaded in this worker runtime.`,
    } satisfies BridgeOutput);
  }

  try {
    const raw = (
      converter as (input: string | Uint8Array, optionsJson: string) => string
    )(modelInput, optionsJson);
    return JSON.stringify(JSON.parse(raw));
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies BridgeOutput);
  }
}

function ncnnWasmConvert(onnxBase64: string, optionsJson: string): string {
  return callStrictToolchain('ncnnConvert', 'NCNN', onnxBase64, optionsJson);
}

function mnnWasmConvert(onnxBase64: string, optionsJson: string): string {
  return callStrictToolchain('mnnConvert', 'MNN', onnxBase64, optionsJson);
}

function openvinoWasmConvert(onnxBase64: string, optionsJson: string): string {
  return callStrictToolchain('openvinoConvert', 'OpenVINO', onnxBase64, optionsJson);
}

function paddleliteWasmConvert(onnxBase64: string, optionsJson: string): string {
  return callStrictToolchain('paddleliteConvert', 'PaddleLite', onnxBase64, optionsJson);
}

function tnnWasmConvert(onnxBase64: string, optionsJson: string): string {
  return callStrictToolchain('tnnConvert', 'TNN', onnxBase64, optionsJson);
}

function genericWasmConvert(
  formatId: string,
  onnxBase64: string,
  optionsJson: string
): Promise<string> {
  return convertWithRuntimeToolchain(formatId, onnxBase64, optionsJson);
}



/**
 * Initialize Pyodide runtime with all required dependencies.
 * This is the main initialization function that sets up the Python environment.
 */
async function initPyodide(): Promise<WorkerPyodide> {
  if (pyodide) return pyodide;
  if (isLoading) {
    while (!pyodide) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return pyodide;
  }

  isLoading = true;
  dependencyStatus = PYTHON_DEPENDENCIES.map(dep => ({ name: dep.name, status: 'pending' }));

  try {
    sendProgressToMain('loading', 5, '正在初始化 Pyodide...');

    const loadPyodide = await getLoadPyodide();
    const pyodideVersion =
      typeof __PYODIDE_VERSION__ !== 'undefined' ? __PYODIDE_VERSION__ : '0.25.1';

    pyodide = (await loadPyodide({
      indexURL: `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`,
      stdout: (text: string) => {
        handlePyodideStdout(text);
      },
      stderr: (text: string) => {
        console.error('[Pyodide]', text);
      },
      fullStdLib: true,
      jsglobals: {
        SharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : undefined,
        setTimeout: self.setTimeout.bind(self),
        clearTimeout: self.clearTimeout.bind(self),
        Object,
        fetch: self.fetch.bind(self),
        Headers,
        Request,
        Response,
        URL,
      },
    })) as unknown as WorkerPyodide;

    const loadedToolchains = await ensureEdgeToolchains();
    runtimeFormats = loadedToolchains.formats;
    (self as unknown as { __onnx2anythingToolchains?: Record<string, unknown> }).__onnx2anythingToolchains = loadedToolchains.toolchains;

    pyodide.registerJsModule('wasm_toolchains', {
      ncnn_wasm_convert: ncnnWasmConvert,
      mnn_wasm_convert: mnnWasmConvert,
      openvino_wasm_convert: openvinoWasmConvert,
      paddlelite_wasm_convert: paddleliteWasmConvert,
      tnn_wasm_convert: tnnWasmConvert,
      convert_with_toolchain: genericWasmConvert,
    });

    sendProgressToMain('loading', 20, 'Pyodide 核心加载完成');

    // Load preloaded packages
    sendProgressToMain('loading', 25, '加载基础包...');
    await pyodide.loadPackage(PRELOAD_PACKAGES);

    // Install Python dependencies
    sendProgressToMain('loading', 30, '安装 Python 依赖...');
    await installPythonDependencies(pyodide);

    sendProgressToMain('loading', 50, 'Python 环境就绪');

    // Load converter modules
    sendProgressToMain('loading', 55, '加载转换器模块...');
    await loadPythonModules(pyodide);

    sendProgressToMain('loading', 60, '转换器初始化完成');

    return pyodide;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Pyodide initialization failed:', error);
    sendProgressToMain('error', 0, `初始化失败: ${errorMsg}`);
    throw error;
  } finally {
    isLoading = false;
  }
}

/**
 * Handle stdout from Pyodide to capture progress logs from Python.
 */
function handlePyodideStdout(text: string): void {
  console.log('[Pyodide]', text);

  // Parse progress log format from JSLogger
  const logMatch = text.match(/\[PYLOG\](.+?)\[\/PYLOG\]/);
  if (logMatch) {
    try {
      const logEntry = JSON.parse(logMatch[1]);
      if (logEntry.stage && logEntry.percent !== undefined) {
        sendProgressToMain(logEntry.stage, logEntry.percent, logEntry.message);
      }
    } catch (e) {
      // Not a valid log entry, ignore
    }
  }

  // Parse loading messages
  if (text.includes('Loading')) {
    const match = text.match(/Loading ([^\s]+)/);
    if (match) {
      sendProgressToMain('loading', 10, `正在加载: ${match[1]}...`);
    }
  }
}

/**
 * Send progress update to main thread.
 */
function sendProgressToMain(stage: string, percent: number, message: string): void {
  const progress: ProgressMessage = { type: 'progress', stage, percent, message };
  self.postMessage(progress);
}

/**
 * Install Python dependencies using micropip.
 */
async function installPythonDependencies(py: WorkerPyodide): Promise<void> {
  const criticalDeps = PYTHON_DEPENDENCIES.filter(d => d.critical);
  const optionalDeps = PYTHON_DEPENDENCIES.filter(d => !d.critical);

  // Install critical dependencies first
  const criticalPackages = criticalDeps.map(d => `${d.name}${d.version}`);

  try {
    await py.runPythonAsync(`
import micropip
import asyncio

async def install_critical():
    packages = ${JSON.stringify(criticalPackages)}
    for i, pkg in enumerate(packages):
        print(f"Installing critical package {i+1}/{len(packages)}: {pkg}")
        try:
            await micropip.install(pkg)
            print(f"Successfully installed: {pkg}")
        except Exception as e:
            print(f"Failed to install {pkg}: {e}")
            raise

await install_critical()
`);

    // Update dependency status
    criticalDeps.forEach(dep => {
      const status = dependencyStatus.find(s => s.name === dep.name);
      if (status) status.status = 'loaded';
    });

    sendProgressToMain('loading', 45, '关键依赖安装完成');
  } catch (error) {
    criticalDeps.forEach(dep => {
      const status = dependencyStatus.find(s => s.name === dep.name);
      if (status) {
        status.status = 'error';
        status.error = String(error);
      }
    });
    throw new Error(`Critical dependency installation failed: ${error}`);
  }

  // Install optional dependencies in background
  if (optionalDeps.length > 0) {
    const optionalPackages = optionalDeps.map(d => `${d.name}${d.version}`);
    py.runPythonAsync(`
import micropip
import asyncio

async def install_optional():
    packages = ${JSON.stringify(optionalPackages)}
    for pkg in packages:
        try:
            await micropip.install(pkg)
            print(f"Optional package installed: {pkg}")
        except Exception as e:
            print(f"Optional package failed (non-critical): {pkg} - {e}")

# Run in background without awaiting
asyncio.create_task(install_optional())
`).catch(err => {
      console.warn('Optional dependencies installation failed:', err);
    });
  }
}

/**
 * Load Python converter modules into Pyodide virtual file system.
 */
async function loadPythonModules(py: WorkerPyodide): Promise<void> {
  // Create directory structure
  py.runPythonSync(`
import os
os.makedirs('/packages/wasm-converter/python/converters', exist_ok=True)
os.makedirs('/packages/wasm-converter/python/utils', exist_ok=True)
os.makedirs('/tmp/onnx_convert', exist_ok=True)
os.makedirs('/tmp/onnx_tflite', exist_ok=True)
os.makedirs('/tmp/onnx_openvino', exist_ok=True)
os.makedirs('/tmp/onnx_ncnn', exist_ok=True)
os.makedirs('/tmp/onnx_mnn', exist_ok=True)
os.makedirs('/tmp/onnx_paddlelite', exist_ok=True)
`);

  // Load converters/base.py
  const baseCode = await fetchPythonModule('converters/base.py');
  py.FS.writeFile('/packages/wasm-converter/python/converters/base.py', baseCode);

  // Load converters/__init__.py
  const convertersInitCode = await fetchPythonModule('converters/__init__.py');
  py.FS.writeFile('/packages/wasm-converter/python/converters/__init__.py', convertersInitCode);

  // Load converters/tflite_converter.py
  const tfliteCode = await fetchPythonModule('converters/tflite_converter.py');
  py.FS.writeFile('/packages/wasm-converter/python/converters/tflite_converter.py', tfliteCode);

  // Load converters/openvino_converter.py
  const openvinoCode = await fetchPythonModule('converters/openvino_converter.py');
  py.FS.writeFile('/packages/wasm-converter/python/converters/openvino_converter.py', openvinoCode);

  // Load converters/ncnn_converter.py
  const ncnnCode = await fetchPythonModule('converters/ncnn_converter.py');
  py.FS.writeFile('/packages/wasm-converter/python/converters/ncnn_converter.py', ncnnCode);

  // Load converters/mnn_converter.py
  const mnnCode = await fetchPythonModule('converters/mnn_converter.py');
  py.FS.writeFile('/packages/wasm-converter/python/converters/mnn_converter.py', mnnCode);

  // Load converters/paddlelite_converter.py
  const paddleliteCode = await fetchPythonModule('converters/paddlelite_converter.py');
  py.FS.writeFile('/packages/wasm-converter/python/converters/paddlelite_converter.py', paddleliteCode);

  // Load utils/model_utils.py
  const utilsCode = await fetchPythonModule('utils/model_utils.py');
  py.FS.writeFile('/packages/wasm-converter/python/utils/model_utils.py', utilsCode);

  // Load entry.py
  const entryCode = await fetchPythonModule('entry.py');
  py.FS.writeFile('/packages/wasm-converter/python/entry.py', entryCode);

  // Add to Python path and import
  py.runPythonSync(`
import sys
if '/packages/wasm-converter/python' not in sys.path:
    sys.path.insert(0, '/packages/wasm-converter/python')
`);

  // Verify modules can be imported
  try {
    py.runPythonSync(`
try:
    from entry import convert_model, validate_model, analyze_model
    print("[PYLOG]{\\"level\\": \\"INFO\\", \\"message\\": \\"Python modules loaded successfully\\", \\"stage\\": \\"loading\\", \\"percent\\": 60}[/PYLOG]")
except Exception as e:
    print(f"Module import error: {e}")
    # Try basic imports
    import onnx
    print("[PYLOG]{\\"level\\": \\"INFO\\", \\"message\\": \\"ONNX available, modules will use fallback mode\\", \\"stage\\": \\"loading\\", \\"percent\\": 60}[/PYLOG]")
`);
  } catch (e) {
    console.warn('Python module import warning:', e);
    // Continue anyway, modules can be loaded on-demand
  }
}

/**
 * Fetch Python module code from the server.
 */
async function fetchPythonModule(relativePath: string): Promise<string> {
  // Try to fetch from various paths
  const paths = [
    `/packages/wasm-converter/python/${relativePath}`,
    `../packages/wasm-converter/python/${relativePath}`,
    `/python/${relativePath}`,
  ];

  for (const path of paths) {
    try {
      const response = await fetch(path);
      if (response.ok) {
        return await response.text();
      }
    } catch (e) {
      // Continue to next path
    }
  }

  // If fetching fails, return empty string (will use fallback)
  console.warn(`Failed to fetch Python module: ${relativePath}`);
  return '';
}

/**
 * Handle conversion request.
 */
async function handleConvert(message: ConversionMessage): Promise<void> {
  if (conversionInFlight) {
    console.warn('Ignoring duplicate convert request while a conversion is already running.');
    return;
  }

  conversionInFlight = true;

  if (!message.modelBuffer) {
    sendError('No model buffer provided');
    conversionInFlight = false;
    return;
  }

  if (message.modelBuffer.byteLength > MAX_MODEL_FILE_SIZE_BYTES) {
    sendError(getModelSizeLimitMessage());
    conversionInFlight = false;
    return;
  }

  try {
    // Prepare options
    const options = {
      targetFormat: message.targetFormat || 'tflite',
      quantization: message.quantization || 'none',
      optimization: message.optimization !== false,
      ...message.options,
    };

    if (options.targetFormat !== 'tflite') {
      sendProgressToMain('loading', 18, `正在装载 ${options.targetFormat} 工具链...`);
      await ensureRuntimeToolchainLoaded(options.targetFormat);
    }

    if (runtimeToolchains.has(options.targetFormat)) {
      sendProgressToMain('loading', 24, '浏览器侧工具链已就绪');

      const raw = await convertWithRuntimeToolchain(
        options.targetFormat,
        new Uint8Array(message.modelBuffer),
        JSON.stringify(options)
      );
      const result = JSON.parse(raw);

      if (!result.success) {
        sendError(
          formatConversionError(options.targetFormat, result.error || 'Conversion failed'),
          result
        );
        return;
      }

      let outputBytes: Uint8Array;
      let filename = result.output_filename || `model.${options.targetFormat}`;

      if (result.param_base64 && result.bin_base64) {
        outputBytes = createZip([
          { name: 'model.param', data: base64ToBytes(result.param_base64) },
          { name: 'model.bin', data: base64ToBytes(result.bin_base64) },
        ]);
        filename = 'model.ncnn.zip';
      } else if (result.proto_base64 && result.model_base64) {
        outputBytes = createZip([
          { name: 'model.tnnproto', data: base64ToBytes(result.proto_base64) },
          { name: 'model.tnnmodel', data: base64ToBytes(result.model_base64) },
        ]);
        filename = 'model.tnn.zip';
      } else if (result.output_base64) {
        outputBytes = base64ToBytes(result.output_base64);
      } else {
        sendError('Toolchain returned no output payload', result);
        return;
      }

      sendProgressToMain('done', 100, '转换完成！');

      const transferableBuffer = outputBytes.buffer.slice(
        outputBytes.byteOffset,
        outputBytes.byteOffset + outputBytes.byteLength
      ) as ArrayBuffer;

      const resultMsg: ResultMessage = {
        type: 'result',
        buffer: transferableBuffer,
        filename,
        warning: result.warning,
        result: {
          originalSize: message.modelBuffer.byteLength,
          convertedSize: outputBytes.byteLength,
          quantization: options.quantization,
          format: options.targetFormat,
          warnings: result.warning ? [result.warning] : undefined,
          metadata: {
            quantization: options.quantization,
            toolchainId: options.targetFormat,
            toolchainRuntime: 'wasm-module',
          },
        },
      };
      self.postMessage(resultMsg, [transferableBuffer]);
      return;
    }

    const py = await initPyodide();

    sendProgressToMain('loading', 10, '正在准备模型...');

    // Convert buffer to base64 for Python
    const base64Data = arrayBufferToBase64(message.modelBuffer);

    sendProgressToMain('converting', 40, '开始转换...');

    // Call entry.convert_model
    const resultJson = py.runPythonSync(`
import json
import sys
sys.path.insert(0, '/packages/wasm-converter/python')

try:
    from entry import convert_model
    result = convert_model('${base64Data}', '${options.targetFormat}', True, '${JSON.stringify(options).replace(/'/g, "\\'")}')
    result
except Exception as e:
    import traceback
    json.dumps({"success": False, "error": str(e), "traceback": traceback.format_exc()})
`);

    const result = JSON.parse(resultJson);

    if (!result.success) {
      sendError(result.error || 'Conversion failed', result);
      return;
    }

    // Decode base64 output
    if (result.model_base64) {
      sendProgressToMain('finalizing', 95, '正在生成输出文件...');

      const outputBuffer = py.runPythonSync(`
import base64
base64.b64decode('${result.model_base64}')
`);

      // Determine filename
      const defaultExtensions: Record<string, string> = {
        tflite: 'tflite',
        openvino: 'openvino.zip',
        ncnn: 'ncnn.zip',
        mnn: 'mnn',
        paddlelite: 'paddlelite.zip',
      };
      const filename =
        result.filename ||
        `model.${defaultExtensions[options.targetFormat] || options.targetFormat}`;

      sendProgressToMain('done', 100, '转换完成！');

      const resultMsg: ResultMessage = {
        type: 'result',
        buffer: (outputBuffer as any).buffer.slice((outputBuffer as any).byteOffset, (outputBuffer as any).byteOffset + (outputBuffer as any).byteLength),
        filename: filename,
        warning: result.warning,
        result: {
          originalSize: message.modelBuffer.byteLength,
          convertedSize: result.model_size,
          quantization: options.quantization,
          format: options.targetFormat,
          warnings: result.warning ? [result.warning] : undefined,
          metadata: {
            quantization: options.quantization,
            toolchainId: options.targetFormat,
            toolchainRuntime: options.targetFormat === 'tflite' ? 'pyodide' : 'wasm-module',
          },
        },
      };
      self.postMessage(resultMsg, [resultMsg.buffer!]);
    } else {
      sendProgressToMain('done', 100, '转换完成（无输出文件）');
      const resultMsg: ResultMessage = {
        type: 'result',
        result: result,
      };
      self.postMessage(resultMsg);
    }

  } catch (error) {
    sendError(
      formatConversionError(
        message.targetFormat || 'tflite',
        error instanceof Error ? error.message : String(error)
      )
    );
  } finally {
    conversionInFlight = false;
  }
}

/**
 * Handle model validation request.
 */
async function handleValidate(message: ConversionMessage): Promise<void> {
  if (!message.modelBuffer) {
    sendError('No model buffer provided');
    return;
  }

  try {
    const py = await initPyodide();

    sendProgressToMain('validating', 0, '开始验证模型...');

    // Convert buffer to base64
    const uint8Array = new Uint8Array(message.modelBuffer);
    const base64Data = py.runPythonSync(`
import base64
data = base64.b64encode(bytes(${JSON.stringify(Array.from(uint8Array))})).decode('utf-8')
data
`);

    // Call validate_model
    const resultJson = py.runPythonSync(`
import json
import sys
sys.path.insert(0, '/packages/wasm-converter/python')

try:
    from entry import validate_model
    result = validate_model('${base64Data}', True)
    result
except Exception as e:
    import traceback
    json.dumps({"success": False, "error": str(e), "traceback": traceback.format_exc()})
`);

    const result = JSON.parse(resultJson);

    sendProgressToMain('done', 100, '验证完成');

    const resultMsg: ResultMessage = {
      type: 'result',
      result: result,
    };
    self.postMessage(resultMsg);

  } catch (error) {
    sendError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Handle model analysis request.
 */
async function handleAnalyze(message: ConversionMessage): Promise<void> {
  if (!message.modelBuffer) {
    sendError('No model buffer provided');
    return;
  }

  try {
    const py = await initPyodide();

    sendProgressToMain('analyzing', 0, '开始分析模型...');

    // Convert buffer to base64
    const uint8Array = new Uint8Array(message.modelBuffer);
    const base64Data = py.runPythonSync(`
import base64
data = base64.b64encode(bytes(${JSON.stringify(Array.from(uint8Array))})).decode('utf-8')
data
`);

    // Call analyze_model
    const resultJson = py.runPythonSync(`
import json
import sys
sys.path.insert(0, '/packages/wasm-converter/python')

try:
    from entry import analyze_model
    result = analyze_model('${base64Data}', True)
    result
except Exception as e:
    import traceback
    json.dumps({"success": False, "error": str(e), "traceback": traceback.format_exc()})
`);

    const result = JSON.parse(resultJson);

    sendProgressToMain('done', 100, '分析完成');

    const resultMsg: ResultMessage = {
      type: 'result',
      result: result,
    };
    self.postMessage(resultMsg);

  } catch (error) {
    sendError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Handle model simplification request.
 */
async function handleSimplify(message: ConversionMessage): Promise<void> {
  if (!message.modelBuffer) {
    sendError('No model buffer provided');
    return;
  }

  try {
    const py = await initPyodide();

    sendProgressToMain('simplifying', 0, '开始简化模型...');

    // Convert buffer to base64
    const uint8Array = new Uint8Array(message.modelBuffer);
    const base64Data = py.runPythonSync(`
import base64
data = base64.b64encode(bytes(${JSON.stringify(Array.from(uint8Array))})).decode('utf-8')
data
`);

    const options = message.options || {};

    // Call simplify_model
    const resultJson = py.runPythonSync(`
import json
import sys
sys.path.insert(0, '/packages/wasm-converter/python')

try:
    from entry import simplify_model
    result = simplify_model('${base64Data}', True, '${JSON.stringify(options).replace(/'/g, "\\'")}')
    result
except Exception as e:
    import traceback
    json.dumps({"success": False, "error": str(e), "traceback": traceback.format_exc()})
`);

    const result = JSON.parse(resultJson);

    if (!result.success) {
      sendError(result.error || 'Simplification failed', result);
      return;
    }

    // Decode simplified model if available
    let outputBuffer: ArrayBuffer | undefined;
    if (result.model_base64) {
      const decodedBuffer = py.runPythonSync(`
import base64
base64.b64decode('${result.model_base64}')
`);
      outputBuffer = (decodedBuffer as any).buffer.slice(
        (decodedBuffer as any).byteOffset,
        (decodedBuffer as any).byteOffset + (decodedBuffer as any).byteLength
      );
    }

    sendProgressToMain('done', 100, '简化完成');

    const resultMsg: ResultMessage = {
      type: 'result',
      buffer: outputBuffer,
      result: result,
      filename: 'simplified.onnx',
    };
    if (outputBuffer) {
      self.postMessage(resultMsg, [outputBuffer]);
    } else {
      self.postMessage(resultMsg);
    }

  } catch (error) {
    sendError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Send error message to main thread.
 */
function sendError(error: string, details?: any): void {
  const errorMsg: ResultMessage = {
    type: 'error',
    error: error,
    result: details,
  };
  self.postMessage(errorMsg);
}

/**
 * Handle initialization check.
 */
async function handleInit(): Promise<void> {
  try {
    const loadedToolchains = await ensureEdgeToolchains();
    runtimeFormats = loadedToolchains.formats;
    (self as unknown as { __onnx2anythingToolchains?: Record<string, unknown> }).__onnx2anythingToolchains = loadedToolchains.toolchains;

    const result: ResultMessage = {
      type: 'ready',
      result: {
        environment: {
          pyodideInitialized: false,
          workerReady: true,
        },
        formats: runtimeFormats,
      },
    };
    self.postMessage(result);
  } catch (error) {
    sendError(error instanceof Error ? error.message : String(error));
  }
}

// Worker message handler
self.onmessage = async (event: MessageEvent<ConversionMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'init':
      await handleInit();
      break;
    case 'convert':
      await handleConvert(message);
      break;
    case 'validate':
      await handleValidate(message);
      break;
    case 'analyze':
      await handleAnalyze(message);
      break;
    case 'simplify':
      await handleSimplify(message);
      break;
    default:
      sendError(`Unknown message type: ${message.type}`);
  }
};

// Notify main thread that worker is loaded
self.postMessage({ type: 'ready', result: { status: 'worker_loaded' } });
