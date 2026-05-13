import { contextBridge, ipcRenderer } from 'electron';

/**
 * Expose a safe bridge between the renderer (web UI) and main process.
 * The web UI can call window.electronAPI.* to access native features.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Platform info ──────────────────────────────────────────────────
  platform: process.platform,
  isDesktop: true,

  // ─── File dialogs ───────────────────────────────────────────────────
  openModel: () => ipcRenderer.invoke('dialog:openModel'),
  saveOutput: (defaultName: string) => ipcRenderer.invoke('dialog:saveOutput', defaultName),

  // ─── File system ────────────────────────────────────────────────────
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, data: Buffer) => ipcRenderer.invoke('fs:writeFile', filePath, data),

  // ─── Native conversion ──────────────────────────────────────────────
  runnerDir: () => ipcRenderer.invoke('native:runnerDir'),
  availableBackends: () => ipcRenderer.invoke('native:availableBackends'),
  runConversion: (opts: {
    backend: string;
    inputPath: string;
    outputPath: string;
    args?: string[];
  }) => ipcRenderer.invoke('native:runConversion', opts),
});
