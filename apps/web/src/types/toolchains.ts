export type ToolchainAvailability =
  | 'builtin'
  | 'ready'
  | 'build-required'
  | 'unavailable';

export type ToolchainStatus = 'stable' | 'beta' | 'experimental';

export interface ToolchainManifestEntry {
  id: string;
  label: string;
  description: string;
  runtime: 'pyodide' | 'wasm-module';
  availability: ToolchainAvailability;
  status: ToolchainStatus;
  moduleUrl?: string;
  register?: string;
  readinessProbeUrl?: string;
  outputExtension?: string;
  outputFilename?: string;
  outputMime?: string;
  notes?: string[];
  runtimeAvailable?: boolean;
  runtimeStatus?: 'available' | 'requires-toolchain' | 'unavailable';
  runtimeReason?: string;
  verification?: {
    quickComparePassed?: boolean;
    realModelComparePassed?: boolean;
    browserRuntimeReady?: boolean;
    comparedWith?: string;
    note?: string;
  };
}

export interface ToolchainManifest {
  version: string;
  generatedAt: string;
  toolchains: ToolchainManifestEntry[];
}

export interface ToolchainRegistration {
  id: string;
  convert: (modelInput: string | Uint8Array, optionsJson: string) => string | Promise<string>;
}

export interface ToolchainModuleContext {
  register: (toolchain: ToolchainRegistration) => void;
}
