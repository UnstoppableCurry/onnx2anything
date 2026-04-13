import type { ToolchainManifest, ToolchainManifestEntry } from '../types/toolchains';
import type {
  RuntimeAvailability,
  RuntimeFormatCapability,
  RuntimeFormatMap,
  TargetFormat,
} from '../lib/formats';

export const BUILTIN_TOOLCHAINS: ToolchainManifestEntry[] = [
  {
    id: 'tflite',
    label: 'TensorFlow Lite',
    description: '当前仓库已保留 TFLite 浏览器链路脚手架，但浏览器转换依赖链仍未打通。',
    runtime: 'pyodide',
    availability: 'unavailable',
    status: 'stable',
    outputExtension: 'tflite',
    outputFilename: 'model.tflite',
    outputMime: 'application/octet-stream',
    notes: [
      '当前浏览器端 TFLite 仍会在 Pyodide 依赖安装阶段失败：`onnx>=1.15.0` 缺少可用的 pure Python wheel，不能再视为可直接导出。',
      'LiteRT 官方 Web 重点是浏览器内运行 `.tflite` 模型，而不是在浏览器里做 ONNX -> TFLite 转换；本仓库当前应继续把 TFLite 视为 native-verified、browser-not-ready。',
      '项目侧仍保留 TFLite 方向的转换实现与历史一致性基线，但在补齐浏览器依赖链之前，不应把它放进当前网页的可用格式列表。',
      '当前稳妥路径仍是 `npm run export:tflite:native -- <modelPath> <outPath>`。',
    ],
    runtimeAvailable: false,
    runtimeStatus: 'requires-toolchain',
    runtimeReason:
      '当前 Pyodide 侧安装 `onnx>=1.15.0` 会失败，而 LiteRT 官方 Web 也不提供现成的 ONNX -> TFLite 浏览器转换链；在补齐可运行依赖前不要放入主转换入口。',
    verification: {
      quickComparePassed: true,
      realModelComparePassed: true,
      browserRuntimeReady: false,
      comparedWith: 'ONNX',
      note: 'TFLite 历史 quick baseline 与 real-model compare 已做过，但当前浏览器运行时未就绪。',
    },
  },
];

export const TOOLCHAIN_MANIFEST_URL = '/toolchains/manifest.json';

function mergeToolchains(entries: ToolchainManifestEntry[]): ToolchainManifestEntry[] {
  const byId = new Map<string, ToolchainManifestEntry>();

  for (const entry of BUILTIN_TOOLCHAINS) {
    byId.set(entry.id, entry);
  }

  for (const entry of entries) {
    byId.set(entry.id, {
      ...byId.get(entry.id),
      ...entry,
      notes: entry.notes ?? byId.get(entry.id)?.notes,
    });
  }

  return Array.from(byId.values());
}

export async function fetchToolchainManifest(): Promise<ToolchainManifest> {
  try {
    const response = await fetch(TOOLCHAIN_MANIFEST_URL, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return {
        version: 'builtin-only',
        generatedAt: new Date().toISOString(),
        toolchains: BUILTIN_TOOLCHAINS,
      };
    }

    const manifest = (await response.json()) as ToolchainManifest;
    return {
      ...manifest,
      toolchains: mergeToolchains(manifest.toolchains ?? []),
    };
  } catch {
    return {
      version: 'builtin-only',
      generatedAt: new Date().toISOString(),
      toolchains: BUILTIN_TOOLCHAINS,
    };
  }
}

export function getToolchainRuntimeStatus(
  entry: ToolchainManifestEntry
): RuntimeAvailability {
  if (entry.runtimeStatus) {
    return entry.runtimeStatus;
  }

  if (entry.availability === 'builtin' || entry.availability === 'ready') {
    return 'available';
  }

  if (entry.availability === 'unavailable') {
    return 'unavailable';
  }

  return 'requires-toolchain';
}

export function getToolchainRuntimeReason(
  entry: ToolchainManifestEntry
): string | undefined {
  return entry.runtimeReason || entry.verification?.note || entry.notes?.[0];
}

export function toRuntimeFormatCapability(
  entry: ToolchainManifestEntry,
  reason?: string
): RuntimeFormatCapability {
  const runtimeStatus = getToolchainRuntimeStatus(entry);

  return {
    available: runtimeStatus === 'available',
    runtime: runtimeStatus,
    wasmSupported: runtimeStatus === 'available',
    reason: reason || getToolchainRuntimeReason(entry),
  };
}

export function getToolchainRuntimeBlockReason(
  entry: ToolchainManifestEntry
): string | null {
  const runtimeStatus = getToolchainRuntimeStatus(entry);
  if (runtimeStatus === 'available') {
    return null;
  }

  const defaultReason =
    runtimeStatus === 'unavailable'
      ? `${entry.label} 当前在这个工作区里尚未接入浏览器运行时。`
      : `${entry.label} 需要先完成对应的 WASM 编译，然后才能在浏览器里使用。`;

  return getToolchainRuntimeReason(entry) || defaultReason;
}

export function applyRuntimeCapabilities(
  entries: ToolchainManifestEntry[],
  runtimeFormats: RuntimeFormatMap = {}
): ToolchainManifestEntry[] {
  return entries.map((entry) => {
    const runtime = runtimeFormats[entry.id as TargetFormat];
    if (!runtime) {
      return entry;
    }

    const notes = [...(entry.notes ?? [])];
    if (runtime.reason && !notes.includes(runtime.reason)) {
      notes.push(runtime.reason);
    }

    let availability = entry.availability;
    if (!runtime.available) {
      availability =
        runtime.runtime === 'requires-toolchain' ? 'build-required' : 'unavailable';
    } else if (entry.runtime === 'wasm-module') {
      availability = 'ready';
    }

    return {
      ...entry,
      availability,
      notes,
      runtimeAvailable: runtime.available,
      runtimeStatus: runtime.runtime,
      runtimeReason: runtime.reason,
    };
  });
}

export function isToolchainSelectable(entry: ToolchainManifestEntry): boolean {
  return entry.availability === 'builtin' || entry.availability === 'ready';
}

export function getToolchainBadge(entry: ToolchainManifestEntry): string {
  if (entry.availability === 'builtin') return '内建';
  if (entry.availability === 'ready') return entry.status === 'stable' ? '可用' : '实验';
  if (entry.availability === 'build-required') return '需编译';
  return '不可用';
}

export function getToolchainStatusTone(
  entry: ToolchainManifestEntry
): 'ready' | 'beta' | 'coming' {
  if (entry.availability === 'builtin' || entry.availability === 'ready') {
    return entry.status === 'stable' ? 'ready' : 'beta';
  }

  return 'coming';
}
