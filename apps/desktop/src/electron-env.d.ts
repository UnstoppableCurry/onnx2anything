/** Type declarations for the Electron preload bridge */

interface ElectronAPI {
  platform: NodeJS.Platform;
  isDesktop: boolean;

  // File dialogs
  openModel: () => Promise<string | null>;
  saveOutput: (defaultName: string) => Promise<string | null>;

  // File system
  readFile: (filePath: string) => Promise<Buffer>;
  writeFile: (filePath: string, data: Buffer) => Promise<boolean>;

  // Native conversion
  runnerDir: () => Promise<string>;
  availableBackends: () => Promise<Record<string, boolean>>;
  runConversion: (opts: {
    backend: string;
    inputPath: string;
    outputPath: string;
    args?: string[];
  }) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
