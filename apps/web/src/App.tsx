import React, { useState, useCallback, useEffect } from 'react';
import { Toaster } from 'sonner';
import { Cpu, Github, FileCode, Sparkles } from 'lucide-react';

import { ModelUploader } from './components/ModelUploader';
import { ConverterPanel, DEFAULT_OPTIONS } from './components/ConverterPanel';
import { ProgressTracker } from './components/ProgressTracker';
import { DownloadPanel } from './components/DownloadPanel';
import { useConversion } from './hooks/useConversion';
import { useModelInfo } from './hooks/useModelInfo';
import { useToolchainManifest } from './hooks/useToolchainManifest';
import type { TargetFormat, QuantizationType } from './components/ConverterPanel';
import {
  BUILTIN_TOOLCHAINS,
  applyRuntimeCapabilities,
  isToolchainSelectable,
} from './utils/toolchains';

const USER_VISIBLE_TOOLCHAIN_IDS = new Set(['tflite', 'ncnn', 'mnn', 'paddlelite', 'tnn', 'tengine']);

// 转换选项映射
interface ConversionOptions {
  targetFormat: TargetFormat;
  quantization: QuantizationType;
  optimization: boolean;
  optimizationLevel: 'none' | 'basic' | 'aggressive';
  dynamicShapes: boolean;
  calibrateDataset?: 'none' | 'random' | 'custom';
  verboseLogging: boolean;
}

// 暗色模式切换组件
const ThemeToggle: React.FC = () => {
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    if (newIsDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-muted transition-colors"
      aria-label={isDark ? '切换到亮色模式' : '切换到暗色模式'}
    >
      {isDark ? (
        <span className="text-sm">☀️</span>
      ) : (
        <span className="text-sm">🌙</span>
      )}
    </button>
  );
};

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modelBuffer, setModelBuffer] = useState<ArrayBuffer | null>(null);
  const [uploaderResetToken, setUploaderResetToken] = useState(0);
  const [options, setOptions] = useState<ConversionOptions>(DEFAULT_OPTIONS);
  const {
    toolchains,
    isLoading: isLoadingToolchains,
    error: toolchainError,
  } = useToolchainManifest();

  const {
    isReady,
    isConverting,
    progress,
    error: conversionError,
    result,
    runtimeInfo,
    startConversion,
    downloadResult,
    reset: resetConversion,
  } = useConversion();

  const {
    isLoading: isExtractingModelInfo,
    error: modelInfoError,
    extractModelInfo,
    reset: resetModelInfo,
  } = useModelInfo();

  const handleFileSelect = useCallback(
    async (fileInfo: { file: File; isValid: boolean }) => {
      if (!fileInfo.isValid) {
        setSelectedFile(null);
        setModelBuffer(null);
        return;
      }

      setSelectedFile(fileInfo.file);

      try {
        const buffer = await fileInfo.file.arrayBuffer();
        setModelBuffer(buffer);

        // 提取模型信息
        await extractModelInfo(fileInfo.file);
      } catch (err) {
        console.error('Failed to read file:', err);
      }
    },
    [extractModelInfo]
  );

  const handleFileClear = useCallback(() => {
    setSelectedFile(null);
    setModelBuffer(null);
    setUploaderResetToken((value) => value + 1);
    resetModelInfo();
    resetConversion();
  }, [resetModelInfo, resetConversion]);

  const handleConvert = useCallback(() => {
    if (!modelBuffer) return;

    // 转换选项格式
    const conversionOptions = {
      targetFormat: options.targetFormat,
      quantization: options.quantization,
      optimization: options.optimization,
    };

    startConversion(modelBuffer, conversionOptions);
  }, [modelBuffer, options, startConversion]);

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setModelBuffer(null);
    setUploaderResetToken((value) => value + 1);
    setOptions(DEFAULT_OPTIONS);
    resetModelInfo();
    resetConversion();
  }, [resetModelInfo, resetConversion]);

  const handleCancel = useCallback(() => {
    // 取消转换逻辑
    resetConversion();
  }, [resetConversion]);

  const availableToolchains = applyRuntimeCapabilities(
    toolchains.length > 0 ? toolchains : BUILTIN_TOOLCHAINS,
    runtimeInfo?.formats
  ).filter((toolchain) => USER_VISIBLE_TOOLCHAIN_IDS.has(toolchain.id));
  const readyToolchains = availableToolchains.filter(isToolchainSelectable);
  useEffect(() => {
    if (readyToolchains.length === 0) {
      return;
    }

    const currentReady = readyToolchains.some(
      (toolchain) => toolchain.id === options.targetFormat
    );

    if (!currentReady) {
      setOptions((prev) => ({
        ...prev,
        targetFormat: readyToolchains[0].id as TargetFormat,
      }));
    }
  }, [options.targetFormat, readyToolchains]);

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary rounded-lg">
                <Cpu className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">ONNX2Anything</h1>
                <p className="text-sm text-muted-foreground">
                  浏览器端 ONNX 模型转换工具
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <a
                href="https://github.com/onnx/onnx"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-muted"
              >
                <Github className="w-5 h-5" />
                <span className="hidden sm:inline">GitHub</span>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="space-y-6">
          <section
            className="bg-card rounded-2xl border border-border p-6 md:p-7"
            data-testid="hero-section"
          >
            <h2 className="text-lg font-semibold tracking-tight">
              上传 ONNX → 选择格式 → 点击转换
            </h2>

            {(isLoadingToolchains || toolchainError) && (
              <p className="mt-3 text-xs text-muted-foreground">
                {isLoadingToolchains
                  ? '正在同步可用工具链...'
                  : `工具链清单读取失败，当前回退到内建格式。${toolchainError}`}
              </p>
            )}
          </section>

          <section
            className="bg-card rounded-2xl border border-border p-6 md:p-7"
            data-testid="upload-section"
          >
            <div className="flex items-center gap-2 mb-4">
              <FileCode className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">1. 上传 ONNX 模型</h3>
            </div>
            <ModelUploader
              key={`model-uploader-${uploaderResetToken}`}
              onFileSelect={handleFileSelect}
              onFileClear={handleFileClear}
              disabled={isConverting}
              resetToken={uploaderResetToken}
            />

            {(selectedFile || isExtractingModelInfo || modelInfoError) && (
              <div className="mt-3" data-testid="model-summary">
                <p className="text-xs text-muted-foreground">
                  {isExtractingModelInfo
                    ? '正在读取模型...'
                    : modelInfoError
                      ? `模型读取失败：${modelInfoError}`
                      : selectedFile
                        ? `已选择：${selectedFile.name}`
                        : ''}
                </p>
              </div>
            )}
          </section>

          <section
            className="bg-card rounded-2xl border border-border p-6 md:p-7"
            data-testid="conversion-section"
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">2. 选择输出格式并开始转换</h3>
            </div>
            <ConverterPanel
              options={options}
              formats={readyToolchains}
              onOptionsChange={setOptions}
              onConvert={handleConvert}
              isConverting={isConverting}
              hasModel={!!modelBuffer}
              isReady={isReady}
            />
          </section>

          {(isConverting || progress.stage !== 'idle') && (
            <section
              className="bg-card rounded-2xl border border-border p-6 md:p-7"
              data-testid="progress-section"
            >
              <h3 className="font-semibold mb-4">3. 转换进度</h3>
              <ProgressTracker
                stage={progress.stage}
                percent={progress.percent}
                message={progress.message}
                error={conversionError ?? undefined}
                onCancel={handleCancel}
                onRetry={handleConvert}
              />
            </section>
          )}

          {result && (
            <section
              className="bg-card rounded-2xl border border-border p-6 md:p-7"
              data-testid="download-section"
            >
              <h3 className="font-semibold mb-4">4. 下载结果</h3>
              <DownloadPanel
                result={{
                  buffer: result.buffer,
                  filename: result.filename,
                  format: options.targetFormat,
                  originalSize: selectedFile?.size,
                }}
                onReset={handleReset}
                onDownload={() => downloadResult()}
              />
            </section>
          )}

          {!result && !isConverting && (
            <p className="text-center text-sm text-muted-foreground">
              转换默认在本地完成，不上传模型。
            </p>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <p className="text-sm text-muted-foreground text-center">
            ONNX2Anything — 浏览器端模型转换工具
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
