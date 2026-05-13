import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

// Determine if running in dev mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Keep a global reference of the window object to prevent GC
let mainWindow: BrowserWindow | null = null;

function getPreloadPath(): string {
  if (isDev) {
    return path.join(__dirname, 'preload.js');
  }
  return path.join(__dirname, 'preload.js');
}

function getRendererUrl(): string {
  if (isDev) {
    // In dev mode, load from vite dev server
    return process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  }
  // In production, load the built web app
  return `file://${path.join(__dirname, '../renderer/index.html')}`;
}

/**
 * Resolve path to native runner binaries.
 * In dev, look under project root scripts/native-runners.
 * In production, look under resources/native-runners inside the .app bundle.
 */
function getNativeRunnerDir(): string {
  if (isDev) {
    return path.join(__dirname, '../../../scripts/native-runners');
  }
  return path.join(process.resourcesPath, 'native-runners');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'ONNX2Anything - Desktop Converter',
    titleBarStyle: 'hiddenInset', // macOS native title bar
    vibrancy: 'under-window', // macOS frosted glass effect
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload to use Node.js APIs
    },
  });

  const rendererUrl = getRendererUrl();

  if (rendererUrl.startsWith('http')) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(rendererUrl.replace('file://', ''));
  }

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

/** Open file dialog for selecting ONNX models */
ipcMain.handle('dialog:openModel', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select ONNX Model',
    filters: [
      { name: 'ONNX Models', extensions: ['onnx'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  return result.canceled ? null : result.filePaths[0];
});

/** Open save dialog for output */
ipcMain.handle('dialog:saveOutput', async (_event, defaultName: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Converted Model',
    defaultPath: defaultName,
  });
  return result.canceled ? null : result.filePath;
});

/** Read file as buffer */
ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  return fs.promises.readFile(filePath);
});

/** Write buffer to file */
ipcMain.handle('fs:writeFile', async (_event, filePath: string, data: Buffer) => {
  await fs.promises.writeFile(filePath, data);
  return true;
});

/** Get native runner directory */
ipcMain.handle('native:runnerDir', () => {
  return getNativeRunnerDir();
});

/** Check which native backends are available */
ipcMain.handle('native:availableBackends', () => {
  const runnerDir = getNativeRunnerDir();
  const backends: Record<string, boolean> = {
    ncnn: false,
    mnn: false,
    tflite: false,
    paddlelite: false,
    openvino: false,
    // Explicitly excluded: TensorRT & GPU-bound backends
    tensorrt: false,
  };

  // Check for compiled native binaries
  try {
    const files = fs.readdirSync(runnerDir);
    if (files.includes('mnn_infer') || files.includes('mnn_infer.cpp')) {
      backends.mnn = true;
    }
    if (files.includes('paddlelite_infer') || files.includes('paddlelite_infer.cpp')) {
      backends.paddlelite = true;
    }
  } catch {
    // runner dir doesn't exist yet – all false
  }

  return backends;
});

/**
 * Run a native conversion via CPU-only runner.
 * Returns { stdout, stderr, exitCode }.
 */
ipcMain.handle(
  'native:runConversion',
  async (
    _event,
    opts: { backend: string; inputPath: string; outputPath: string; args?: string[] },
  ) => {
    // Refuse GPU-bound backends
    const gpuBackends = ['tensorrt', 'cuda', 'gpu'];
    if (gpuBackends.some((b) => opts.backend.toLowerCase().includes(b))) {
      return { stdout: '', stderr: 'GPU-bound backends are not supported in desktop mode.', exitCode: 1 };
    }

    const runnerDir = getNativeRunnerDir();
    const binary = path.join(runnerDir, `${opts.backend}_infer`);

    if (!fs.existsSync(binary)) {
      return {
        stdout: '',
        stderr: `Native runner binary not found: ${binary}`,
        exitCode: 127,
      };
    }

    const args = [opts.inputPath, opts.outputPath, ...(opts.args || [])];

    return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      let stdout = '';
      let stderr = '';
      const child: ChildProcess = spawn(binary, args, {
        env: { ...process.env, OMP_NUM_THREADS: String(Math.max(1, (require('os').cpus().length) - 1)) },
      });

      child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      child.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });

      child.on('error', (err) => {
        resolve({ stdout, stderr: err.message, exitCode: 1 });
      });
    });
  },
);

// ─── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // On macOS it's common to re-create a window when the dock icon is clicked
  // But for a converter tool, quitting is more sensible
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
