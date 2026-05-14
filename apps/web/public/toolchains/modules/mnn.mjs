const textEncoder = new TextEncoder();
const MNN_BROWSER_SAFE_ONNX_MAX_BYTES = 100 * 1024 * 1024;
const ONE_MB = 1024 * 1024;
const MNN_INITIAL_MEMORY_MIN_BYTES = 128 * ONE_MB;
const MNN_INITIAL_MEMORY_DEFAULT_BYTES = 256 * ONE_MB;
const MNN_INITIAL_MEMORY_HIGH_WATER_BYTES = 512 * ONE_MB;

function getToolchainBaseOrigin() {
  if (typeof self !== 'undefined' && self.location?.origin) {
    return self.location.origin;
  }
  if (typeof globalThis !== 'undefined' && globalThis.location?.origin) {
    return globalThis.location.origin;
  }
  throw new Error('Unable to resolve browser origin for MNN toolchain');
}

function estimateMnnInitialMemoryBytes(inputBytes) {
  const deviceMemoryGb =
    typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number'
      ? navigator.deviceMemory
      : null;

  const inputSize = inputBytes?.byteLength ?? 0;
  if (deviceMemoryGb !== null && deviceMemoryGb <= 4) {
    return MNN_INITIAL_MEMORY_MIN_BYTES;
  }

  if (inputSize >= 8 * ONE_MB) {
    return MNN_INITIAL_MEMORY_HIGH_WATER_BYTES;
  }

  if (inputSize >= 2 * ONE_MB) {
    return MNN_INITIAL_MEMORY_DEFAULT_BYTES;
  }

  return MNN_INITIAL_MEMORY_MIN_BYTES;
}

function makeMnnBrowserGuardError(inputBytes) {
  return (
    `MNN 浏览器转换前置保护已触发：当前只会拦截超过 100MB 的输入。` +
    `但 2GB 上限的 WASM 构建对 ` +
    `${(inputBytes.byteLength / (1024 * 1024)).toFixed(2)}MB 的 ONNX ` +
    `输入仍可能发生 OOM；本次已按手动测试需求放宽限制，请自行验证实际可用范围。`
  );
}

function normalizeInputBytes(input) {
  if (typeof input === 'string') {
    return base64ToBytes(input);
  }

  if (input instanceof Uint8Array) {
    return input;
  }

  throw new Error('MNN converter expects a base64 string or Uint8Array input');
}

function bytesToBase64(input) {
  let binary = '';
  for (let index = 0; index < input.length; index += 1) {
    binary += String.fromCharCode(input[index]);
  }
  return btoa(binary);
}

function base64ToBytes(input) {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function loadPatchedModule(initialMemoryBytes) {
  const sourceUrl = new URL('/toolchains/mnn/MNNConvert.js', getToolchainBaseOrigin());
  const sourceText = await fetch(sourceUrl).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load MNNConvert.js: ${response.status}`);
    }
    return response.text();
  });

  let patched = sourceText;
  const wasmUrl = new URL('/toolchains/mnn/MNNConvert.wasm', getToolchainBaseOrigin()).toString();
  const modulePreamble = `var __mnnReadyResolve;\nvar Module = {\n  noInitialRun: true,\n  INITIAL_MEMORY: ${initialMemoryBytes},\n  ready: new Promise((resolve) => { __mnnReadyResolve = resolve; }),\n  onRuntimeInitialized() { __mnnReadyResolve(Module); }\n};\n`;
  patched = patched.replace(
    /const __dirname = new URL\((['"])\.\1, import\.meta\.url\)\.pathname\.replace\(\/\\\/\$\/, (['"])\2\);?/g,
    `const __dirname = ${JSON.stringify('/toolchains/mnn')};`
  );
  if (/^var Module\s*=\s*\{\s*noInitialRun:\s*true\s*\};\s*/.test(patched)) {
    patched = patched.replace(/^var Module\s*=\s*\{\s*noInitialRun:\s*true\s*\};\s*/, modulePreamble);
  } else if (patched.startsWith('var Module=typeof Module!=')) {
    patched = `${modulePreamble}${patched}`;
  }

  if (!patched.includes('Module.locateFile = Module.locateFile ||')) {
    patched = patched.replace(
      'var scriptDirectory="";',
      `var scriptDirectory="";Module.locateFile = Module.locateFile || ((path) => path.endsWith('.wasm') ? ${JSON.stringify(wasmUrl)} : path);`
    );
  }

  if (!patched.includes('var asmLibraryArgEnv=')) {
    const asmLibraryArgMatch = patched.match(/var asmLibraryArg=\{([\s\S]*?)\};var asm=createWasm\(\)/);
    if (asmLibraryArgMatch) {
      const identifiers = Array.from(
        new Set(
          Array.from(asmLibraryArgMatch[1].matchAll(/"[^"]+":([A-Za-z_$][A-Za-z0-9_$]*)/g)).map(
            (match) => match[1]
          )
        )
      );

      const aliasEntries = identifiers.map((name) => `${JSON.stringify(name)}:${name}`).join(',');
      patched = patched.replace(
        asmLibraryArgMatch[0],
        `var asmLibraryArg={${asmLibraryArgMatch[1]}};var asmLibraryArgEnv=Object.assign({},asmLibraryArg,{${aliasEntries},"setTempRet0":setTempRet0,"getTempRet0":getTempRet0});var asm=createWasm()`
      );
    }
  }

  if (!patched.includes('var info={"a":asmLibraryArg,"env":asmLibraryArgEnv};')) {
    patched = patched.replace(
      'var info={"a":asmLibraryArg};',
      'var info={"a":asmLibraryArg,"env":asmLibraryArgEnv};'
    );
  }

  if (!patched.includes('Module.FS=FS;Module.callMain=callMain;')) {
    patched = patched.replace(
      'if(Module["onRuntimeInitialized"])Module["onRuntimeInitialized"]();',
      'Module.FS=FS;Module.callMain=callMain;if(Module["onRuntimeInitialized"])Module["onRuntimeInitialized"]();'
    );
  }

  if (!patched.includes('export default Module;')) {
    patched += '\nexport default Module;\n';
  }

  const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(patched)}`;
  return await import(/* @vite-ignore */ dataUrl);
}

async function createModule(inputBytes) {
  const initialMemoryBytes = estimateMnnInitialMemoryBytes(inputBytes);
  const module = await loadPatchedModule(initialMemoryBytes);
  const runtime = module.default ?? module;
  if (!runtime || typeof runtime !== 'object') {
    throw new Error('MNNConvert runtime did not initialize correctly');
  }
  if (runtime.ready && typeof runtime.ready.then === 'function') {
    return runtime.ready;
  }
  return runtime;
}

export function register(context) {
  context.register({
    id: 'mnn',
    async convert(input, optionsJson) {
      try {
        const options = JSON.parse(optionsJson || '{}');
        const inputPath = '/workspace/input.onnx';
        const outputPath = '/workspace/model.mnn';
        const externalWeightPath = '/workspace/model.mnn.weight';
        const inputConfigPath = '/workspace/input_config.txt';
        const args = ['-f', 'ONNX', '--modelFile', inputPath, '--MNNModel', outputPath, '--bizCode', 'ONNX2Anything'];
        const inputBytes = normalizeInputBytes(input);
        const module = await createModule(inputBytes);

        if (inputBytes.byteLength > MNN_BROWSER_SAFE_ONNX_MAX_BYTES) {
          return JSON.stringify({
            success: false,
            error: makeMnnBrowserGuardError(inputBytes),
          });
        }

        if (Number.isInteger(options.optimizeLevel)) {
          args.push('--optimizeLevel', String(options.optimizeLevel));
        }

        if (Number.isInteger(options.optimizePrefer)) {
          args.push('--optimizePrefer', String(options.optimizePrefer));
        }

        if (typeof options.keepInputFormat === 'boolean') {
          args.push('--keepInputFormat', options.keepInputFormat ? '1' : '0');
        }

        if (Number.isInteger(options.convertMatmulToConv)) {
          args.push('--convertMatmulToConv', String(options.convertMatmulToConv));
        }

        if (Number.isInteger(options.weightQuantBits)) {
          args.push('--weightQuantBits', String(options.weightQuantBits));
        }

        if (typeof options.weightQuantAsymmetric === 'boolean') {
          args.push('--weightQuantAsymmetric', options.weightQuantAsymmetric ? '1' : '0');
        }

        if (Number.isInteger(options.weightQuantBlock)) {
          args.push('--weightQuantBlock', String(options.weightQuantBlock));
        }

        if (options.quantization === 'fp16') {
          args.push('--fp16');
        }

        if (options.quantization === 'int8') {
          args.push('--weightQuantBits', '8');
        }

        if (options.dumpPass) {
          args.push('--dumpPass');
        }

        if (options.saveExternalData) {
          args.push('--saveExternalData');
        }

        if (options.saveStaticModel) {
          args.push('--saveStaticModel');
        }

        if (typeof options.inputConfig === 'string' && options.inputConfig.trim()) {
          args.push('--inputConfigFile', inputConfigPath);
        }

        try {
          module.FS.mkdir('/workspace');
        } catch {}

        try {
          module.FS.unlink(inputPath);
        } catch {}

        try {
          module.FS.unlink(outputPath);
        } catch {}

        try {
          module.FS.unlink(externalWeightPath);
        } catch {}

        try {
          module.FS.unlink(inputConfigPath);
        } catch {}

        module.FS.writeFile(inputPath, inputBytes);

        if (typeof options.inputConfig === 'string' && options.inputConfig.trim()) {
          module.FS.writeFile(inputConfigPath, textEncoder.encode(options.inputConfig));
        }

        module.callMain(args);

        const outputBytes = module.FS.readFile(outputPath);
        let externalWeightBytes = null;

        try {
          externalWeightBytes = module.FS.readFile(externalWeightPath);
        } catch {}

        try {
          module.FS.unlink(inputPath);
        } catch {}

        try {
          module.FS.unlink(outputPath);
        } catch {}

        try {
          module.FS.unlink(externalWeightPath);
        } catch {}

        try {
          module.FS.unlink(inputConfigPath);
        } catch {}

        if (externalWeightBytes) {
          return JSON.stringify({
            success: true,
            output_base64: bytesToBase64(outputBytes),
            external_weight_base64: bytesToBase64(externalWeightBytes),
            output_filename: 'model.mnn',
          });
        }

        return JSON.stringify({
          success: true,
          output_base64: bytesToBase64(outputBytes),
          output_filename: 'model.mnn',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const readableError = message.includes('Aborted(OOM)')
          ? 'MNN 浏览器转换命中 WASM 内存上限（当前构建最大 2GB）。虽然前置拦截已放宽到 100MB 以便手动测试，但当前输入仍可能超出浏览器可承受范围。'
          : message;

        return JSON.stringify({
          success: false,
          error: readableError,
        });
      }
    },
  });
}
