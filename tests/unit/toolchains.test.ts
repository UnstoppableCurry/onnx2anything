import { afterEach, describe, expect, it, vi } from 'vitest';

import { BASE_FORMAT_DEFINITIONS, mergeRuntimeFormats } from '@/lib/formats';
import {
  BUILTIN_TOOLCHAINS,
  applyRuntimeCapabilities,
  fetchToolchainManifest,
  getToolchainBadge,
  getToolchainRuntimeBlockReason,
  getToolchainRuntimeStatus,
  isToolchainSelectable,
} from '@/utils/toolchains';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toolchain manifest helpers', () => {
  it('falls back to builtin toolchains when manifest fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const manifest = await fetchToolchainManifest();

    expect(manifest.version).toBe('builtin-only');
    expect(manifest.toolchains).toEqual(BUILTIN_TOOLCHAINS);
  });

  it('marks wasm-module formats as build-required when runtime reports missing toolchains', () => {
    const entries = [
      ...BUILTIN_TOOLCHAINS,
      {
        id: 'ncnn',
        label: 'NCNN',
        description: 'NCNN edge runtime',
        runtime: 'wasm-module' as const,
        availability: 'build-required' as const,
        status: 'experimental' as const,
        notes: ['需要预编译工具链'],
      },
    ];

    const mergedRuntime = mergeRuntimeFormats({}, {
      ncnn: {
        available: false,
        runtime: 'requires-toolchain',
        wasmSupported: false,
        reason: '缺少 onnx2ncnn.wasm',
      },
    });

    const resolved = applyRuntimeCapabilities(entries, mergedRuntime);
    const ncnn = resolved.find((entry) => entry.id === 'ncnn');

    expect(ncnn?.availability).toBe('build-required');
    expect(ncnn?.notes).toContain('缺少 onnx2ncnn.wasm');
    expect(getToolchainBadge(ncnn!)).toBe('需编译');
    expect(isToolchainSelectable(ncnn!)).toBe(false);
  });

  it('marks wasm-module formats ready once runtime reports them available', () => {
    const entries = [
      {
        id: 'mnn',
        label: 'MNN',
        description: 'MNN edge runtime',
        runtime: 'wasm-module' as const,
        availability: 'build-required' as const,
        status: 'beta' as const,
      },
    ];

    const resolved = applyRuntimeCapabilities(entries, {
      mnn: {
        available: true,
        runtime: 'available',
        wasmSupported: true,
      },
    });

    expect(resolved[0].availability).toBe('ready');
    expect(isToolchainSelectable(resolved[0])).toBe(true);
    expect(getToolchainBadge(resolved[0])).toBe('实验');
  });

  it('prefers manifest runtime status and reason when deciding browser load blockers', () => {
    const entry = {
      id: 'mnn',
      label: 'MNN',
      description: 'MNN edge runtime',
      runtime: 'wasm-module' as const,
      availability: 'build-required' as const,
      status: 'experimental' as const,
      runtimeStatus: 'requires-toolchain' as const,
      runtimeReason: '缺少已验证的 MNN 浏览器构建产物，暂不开放浏览器运行时。',
      notes: ['旧说明，不应优先返回'],
    };

    expect(getToolchainRuntimeStatus(entry)).toBe('requires-toolchain');
    expect(getToolchainRuntimeBlockReason(entry)).toBe(
      '缺少已验证的 MNN 浏览器构建产物，暂不开放浏览器运行时。'
    );
  });

  it('keeps paddlelite limitations aligned with the browser-ready opt toolchain', () => {
    const paddlelite = BASE_FORMAT_DEFINITIONS.find(
      (entry) => entry.value === 'paddlelite'
    );

    expect(paddlelite?.limitations).toContain(
      '当前仍需要预编译的 opt WASM 工具链'
    );
  });

  it('keeps mnn limitations aligned with the current browser-ready boundary', () => {
    const mnn = BASE_FORMAT_DEFINITIONS.find((entry) => entry.value === 'mnn');

    expect(mnn?.limitations).toContain(
      '需预编译 MNNConvert 的 WASM 工具链'
    );
  });

  it('registers tnn in BASE_FORMAT_DEFINITIONS with required fields', () => {
    const tnn = BASE_FORMAT_DEFINITIONS.find((entry) => entry.value === 'tnn');

    expect(tnn).toBeDefined();
    expect(tnn?.label).toBe('TNN');
    expect(tnn?.platforms).toContain('Android');
    expect(tnn?.platforms).toContain('iOS');
    expect(tnn?.status).toBe('beta');
  });

  it('marks tnn as build-required when runtime reports missing wasm toolchain', () => {
    const entries = [
      {
        id: 'tnn',
        label: 'TNN',
        description: 'TNN edge runtime',
        runtime: 'wasm-module' as const,
        availability: 'build-required' as const,
        status: 'beta' as const,
      },
    ];

    const resolved = applyRuntimeCapabilities(entries, {
      tnn: {
        available: false,
        runtime: 'requires-toolchain',
        wasmSupported: false,
        reason: '缺少 convert2tnn.wasm',
      },
    });

    expect(resolved[0].availability).toBe('build-required');
    expect(isToolchainSelectable(resolved[0])).toBe(false);
    expect(getToolchainBadge(resolved[0])).toBe('需编译');
  });

  it('marks tnn ready once runtime reports wasm available', () => {
    const entries = [
      {
        id: 'tnn',
        label: 'TNN',
        description: 'TNN edge runtime',
        runtime: 'wasm-module' as const,
        availability: 'build-required' as const,
        status: 'beta' as const,
      },
    ];

    const resolved = applyRuntimeCapabilities(entries, {
      tnn: {
        available: true,
        runtime: 'available',
        wasmSupported: true,
      },
    });

    expect(resolved[0].availability).toBe('ready');
    expect(isToolchainSelectable(resolved[0])).toBe(true);
  });
});
