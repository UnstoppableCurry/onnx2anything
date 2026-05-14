import type { RuntimeFormatMap, TargetFormat } from '../lib/formats';
import type { ToolchainManifestEntry } from '../types/toolchains';
import {
  fetchToolchainManifest,
  getToolchainRuntimeReason,
  getToolchainRuntimeStatus,
  toRuntimeFormatCapability as resolveRuntimeFormatCapability,
} from '../utils/toolchains';

type ToolchainBridge = (
  input: string | Uint8Array,
  optionsJson: string
) => Promise<string> | string;

interface RuntimeToolchainRegistration {
  id: TargetFormat;
  convert: ToolchainBridge;
}

interface RuntimeToolchainModule {
  register?: (context: {
    register: (toolchain: RuntimeToolchainRegistration) => void;
  }) => Promise<unknown> | unknown;
  default?: (context: {
    register: (toolchain: RuntimeToolchainRegistration) => void;
  }) => Promise<unknown> | unknown;
}

type RuntimeToolchainKey =
  | 'ncnnConvert'
  | 'mnnConvert'
  | 'openvinoConvert'
  | 'paddleliteConvert'
  | 'tnnConvert'
  | 'tengineConvert';

const registeredBridgeCache = new Map<string, Promise<ToolchainBridge>>();

const runtimeToolchainKeyByFormat: Record<string, RuntimeToolchainKey> = {
  ncnn: 'ncnnConvert',
  mnn: 'mnnConvert',
  openvino: 'openvinoConvert',
  paddlelite: 'paddleliteConvert',
  tnn: 'tnnConvert',
  tengine: 'tengineConvert',
};

async function urlExists(url?: string): Promise<boolean> {
  if (!url) {
    return false;
  }

  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (response.ok) {
      return true;
    }
  } catch {
    // Fall through to GET probe.
  }

  try {
    const response = await fetch(url, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

async function loadRegisteredBridge(
  moduleUrl: string,
  format: TargetFormat
): Promise<ToolchainBridge> {
  const cacheKey = `${moduleUrl}::${format}`;

  if (!registeredBridgeCache.has(cacheKey)) {
    registeredBridgeCache.set(
      cacheKey,
      (async () => {
        let module: RuntimeToolchainModule;

        if (moduleUrl.startsWith('/toolchains/')) {
          const response = await fetch(moduleUrl, {
            headers: { Accept: 'text/javascript, application/javascript, text/plain' },
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch toolchain module ${moduleUrl}: ${response.status}`);
          }

          const sourceText = await response.text();
          const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(sourceText)}`;
          module = (await import(/* @vite-ignore */ dataUrl)) as RuntimeToolchainModule;
        } else {
          module = (await import(/* @vite-ignore */ moduleUrl)) as RuntimeToolchainModule;
        }

        const registerFn = module.register ?? module.default;
        if (typeof registerFn !== 'function') {
          throw new Error(`Toolchain module ${moduleUrl} does not export register().`);
        }

        let bridge: ToolchainBridge | null = null;
        await Promise.resolve(
          registerFn({
            register(toolchain) {
              if (toolchain.id === format) {
                bridge = toolchain.convert;
              }
            },
          })
        );

        if (!bridge) {
          throw new Error(`Toolchain module ${moduleUrl} did not register "${format}".`);
        }

        return bridge;
      })()
    );
  }

  return registeredBridgeCache.get(cacheKey)!;
}

async function fetchToolchainManifestEntries(): Promise<ToolchainManifestEntry[]> {
  const manifest = await fetchToolchainManifest();
  return manifest.toolchains ?? [];
}

export async function ensureEdgeToolchains(): Promise<{
  toolchains: Partial<Record<RuntimeToolchainKey, ToolchainBridge>>;
  formats: RuntimeFormatMap;
}> {
  const manifestEntries = await fetchToolchainManifestEntries();
  const toolchains: Partial<Record<RuntimeToolchainKey, ToolchainBridge>> = {};
  const formats: RuntimeFormatMap = {};

  const runtimeEntries = manifestEntries.filter((entry) => entry.runtime === 'wasm-module');

  await Promise.all(
    runtimeEntries.map(async (entry) => {
      const key = runtimeToolchainKeyByFormat[entry.id];
      if (!key) {
        return;
      }

      const runtimeStatus = getToolchainRuntimeStatus(entry);
      if (runtimeStatus !== 'available') {
        formats[entry.id as TargetFormat] = resolveRuntimeFormatCapability(entry);
        return;
      }

      if (entry.readinessProbeUrl) {
        const readinessSatisfied = await urlExists(entry.readinessProbeUrl);
        if (!readinessSatisfied) {
          formats[entry.id as TargetFormat] = {
            available: false,
            runtime: 'requires-toolchain',
            wasmSupported: false,
            reason:
              getToolchainRuntimeReason(entry) ||
              `${entry.label} 浏览器运行时探针尚未满足: ${entry.readinessProbeUrl}`,
          };
          return;
        }
      }

      if (!entry.moduleUrl) {
        formats[entry.id as TargetFormat] = {
          available: false,
          runtime: 'requires-toolchain',
          wasmSupported: false,
          reason: `Toolchain "${entry.id}" is missing moduleUrl in the manifest.`,
        };
        return;
      }

      try {
        toolchains[key] = await loadRegisteredBridge(
          entry.moduleUrl,
          entry.id as TargetFormat
        );
        formats[entry.id as TargetFormat] = {
          available: true,
          runtime: 'available',
          wasmSupported: true,
        };
      } catch (error) {
        formats[entry.id as TargetFormat] = {
          available: false,
          runtime: 'requires-toolchain',
          wasmSupported: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  return { toolchains, formats };
}
