import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';

// Pyodide 类型定义
interface PyodideInterface {
  loadPackage: (packages: string | string[]) => Promise<void>;
  runPythonAsync: (code: string) => Promise<unknown>;
  runPython: (code: string) => unknown;
  FS: {
    mkdir: (path: string) => void;
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
    unlink: (path: string) => void;
    rmdir: (path: string) => void;
    readdir: (path: string) => string[];
  };
  pyimport: (name: string) => unknown;
  version: string;
}

type PyodideLoadingState =
  | 'idle'
  | 'loading'
  | 'initializing'
  | 'loading-packages'
  | 'ready'
  | 'error';

interface PyodideState {
  pyodide: PyodideInterface | null;
  loadingState: PyodideLoadingState;
  progress: number;
  error: string | null;
  version: string | null;
}

interface UsePyodideOptions {
  packages?: string[];
  onReady?: () => void;
  onError?: (error: string) => void;
}

// 默认加载的包
const DEFAULT_PACKAGES = ['micropip'];

/**
 * Pyodide 加载和管理 Hook
 *
 * 用于在 React 组件中加载和管理 Pyodide WASM 运行时
 *
 * @example
 * ```tsx
 * const { pyodide, loadingState, isReady, loadPyodide } = usePyodide({
 *   packages: ['numpy', 'pandas'],
 *   onReady: () => console.log('Pyodide is ready!'),
 * });
 * ```
 */
export function usePyodide(options: UsePyodideOptions = {}) {
  const { packages = [], onReady, onError } = options;
  const pyodideRef = useRef<PyodideInterface | null>(null);
  const isLoadingRef = useRef(false);

  const [state, setState] = useState<PyodideState>({
    pyodide: null,
    loadingState: 'idle',
    progress: 0,
    error: null,
    version: null,
  });

  /**
   * 加载 Pyodide
   */
  const loadPyodide = useCallback(async () => {
    if (isLoadingRef.current || pyodideRef.current) {
      return;
    }

    // 检查 SharedArrayBuffer 支持
    if (typeof SharedArrayBuffer === 'undefined') {
      const errorMsg =
        '您的浏览器不支持 SharedArrayBuffer，请在安全上下文中运行 (HTTPS 或 localhost)';
      setState((prev) => ({
        ...prev,
        loadingState: 'error',
        error: errorMsg,
      }));
      onError?.(errorMsg);
      toast.error(errorMsg);
      return;
    }

    isLoadingRef.current = true;

    try {
      setState((prev) => ({
        ...prev,
        loadingState: 'loading',
        progress: 0,
      }));

      // 动态导入 Pyodide
      const { loadPyodide: loadPyodideFunc } = await import('pyodide');

      setState((prev) => ({
        ...prev,
        loadingState: 'initializing',
        progress: 20,
      }));

      // 加载 Pyodide 核心
      const pyodide = (await loadPyodideFunc({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full',
        stdout: (text: string) => {
          console.log('[Pyodide]', text);
        },
        stderr: (text: string) => {
          console.error('[Pyodide]', text);
        },
      })) as unknown as PyodideInterface;

      pyodideRef.current = pyodide;

      setState((prev) => ({
        ...prev,
        loadingState: 'loading-packages',
        progress: 40,
        version: pyodide.version,
      }));

      // 加载默认包
      const allPackages = [...DEFAULT_PACKAGES, ...packages];

      if (allPackages.length > 0) {
        await pyodide.loadPackage(allPackages);
      }

      setState((prev) => ({
        ...prev,
        pyodide,
        loadingState: 'ready',
        progress: 100,
        error: null,
      }));

      onReady?.();
      toast.success('Pyodide 加载成功');
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Pyodide 加载失败';
      setState((prev) => ({
        ...prev,
        loadingState: 'error',
        error: errorMsg,
        progress: 0,
      }));
      onError?.(errorMsg);
      toast.error(`Pyodide 加载失败: ${errorMsg}`);
    } finally {
      isLoadingRef.current = false;
    }
  }, [packages, onReady, onError]);

  /**
   * 使用 micropip 安装 Python 包
   */
  const installPackage = useCallback(
    async (packageName: string) => {
      if (!pyodideRef.current) {
        throw new Error('Pyodide 尚未加载');
      }

      try {
        await pyodideRef.current.runPythonAsync(`
          import micropip
          await micropip.install('${packageName}')
        `);
        toast.success(`已安装 ${packageName}`);
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : `安装 ${packageName} 失败`;
        toast.error(errorMsg);
        throw err;
      }
    },
    []
  );

  /**
   * 运行 Python 代码
   */
  const runPython = useCallback(
    async (code: string): Promise<unknown> => {
      if (!pyodideRef.current) {
        throw new Error('Pyodide 尚未加载');
      }
      return pyodideRef.current.runPythonAsync(code);
    },
    []
  );

  /**
   * 运行同步 Python 代码
   */
  const runPythonSync = useCallback((code: string): unknown => {
    if (!pyodideRef.current) {
      throw new Error('Pyodide 尚未加载');
    }
    return pyodideRef.current.runPython(code);
  }, []);

  /**
   * 写入文件到虚拟文件系统
   */
  const writeFile = useCallback(
    (path: string, data: Uint8Array): void => {
      if (!pyodideRef.current) {
        throw new Error('Pyodide 尚未加载');
      }
      pyodideRef.current.FS.writeFile(path, data);
    },
    []
  );

  /**
   * 从虚拟文件系统读取文件
   */
  const readFile = useCallback(
    (path: string): Uint8Array => {
      if (!pyodideRef.current) {
        throw new Error('Pyodide 尚未加载');
      }
      return pyodideRef.current.FS.readFile(path);
    },
    []
  );

  /**
   * 删除文件
   */
  const deleteFile = useCallback(
    (path: string): void => {
      if (!pyodideRef.current) {
        throw new Error('Pyodide 尚未加载');
      }
      pyodideRef.current.FS.unlink(path);
    },
    []
  );

  /**
   * 创建目录
   */
  const mkdir = useCallback(
    (path: string): void => {
      if (!pyodideRef.current) {
        throw new Error('Pyodide 尚未加载');
      }
      pyodideRef.current.FS.mkdir(path);
    },
    []
  );

  /**
   * 清理虚拟文件系统
   */
  const cleanup = useCallback((): void => {
    if (!pyodideRef.current) return;

    try {
      const tempDir = '/tmp';
      const files = pyodideRef.current.FS.readdir(tempDir);
      for (const file of files) {
        if (file !== '.' && file !== '..') {
          try {
            pyodideRef.current.FS.unlink(`${tempDir}/${file}`);
          } catch {
            // 忽略删除错误
          }
        }
      }
    } catch {
      // 忽略清理错误
    }
  }, []);

  // 自动加载 Pyodide（可选）
  useEffect(() => {
    // 可以在这里自动加载，或者让用户手动触发
    // loadPyodide();
  }, [loadPyodide]);

  return {
    // 状态
    pyodide: state.pyodide,
    loadingState: state.loadingState,
    isReady: state.loadingState === 'ready',
    isLoading: state.loadingState !== 'idle' && state.loadingState !== 'ready' && state.loadingState !== 'error',
    progress: state.progress,
    error: state.error,
    version: state.version,

    // 方法
    loadPyodide,
    installPackage,
    runPython,
    runPythonSync,
    writeFile,
    readFile,
    deleteFile,
    mkdir,
    cleanup,
  };
}

export default usePyodide;
