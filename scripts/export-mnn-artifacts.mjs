import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const nativeScriptPath = path.join(projectRoot, 'scripts/export-mnn-artifacts-native.mjs');

const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter((arg) => arg.startsWith('--')));
const positionalArgs = rawArgs.filter((arg) => !arg.startsWith('--'));
const MNN_BROWSER_SAFE_ONNX_MAX_BYTES = Number(
  process.env.MNN_BROWSER_SAFE_ONNX_MAX_BYTES || 100 * 1024 * 1024
);

const [baseUrl, modelPath, outPath] = positionalArgs;
const shouldFallbackNative =
  flags.has('--fallback-native') || process.env.MNN_EXPORT_FALLBACK === 'native';

if (!baseUrl || !modelPath || !outPath) {
  console.error(
    'Usage: node scripts/export-mnn-artifacts.mjs <baseUrl> <modelPath> <outPath> [--fallback-native]'
  );
  process.exit(1);
}

function isRecoverableBrowserErrorMessage(message) {
  return (
    typeof message === 'string' &&
    (
      message.includes('Aborted(OOM)') ||
      message.includes('WASM 内存上限') ||
      message.includes('前置保护已触发') ||
      message.includes('Timeout') ||
      message.includes('timed out')
    )
  );
}

function resolveModelPathForNative(inputPath) {
  const candidates = [
    inputPath,
    path.resolve(projectRoot, inputPath),
    path.join(projectRoot, 'apps/web/public', inputPath.replace(/^\/+/, '')),
    path.join(projectRoot, 'apps/web/dist', inputPath.replace(/^\/+/, '')),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function runNativeFallback(browserError) {
  const localModelPath = resolveModelPathForNative(modelPath);

  if (!localModelPath) {
    throw new Error(
      `${browserError.message}\nNative fallback could not map model path "${modelPath}" to a local file.`
    );
  }

  console.error(
    `[fallback] Browser MNN export did not complete reliably; switching to native MNNConvert with ${localModelPath}`
  );

  const fallbackResult = spawnSync(
    process.execPath,
    [nativeScriptPath, localModelPath, outPath],
    {
      stdio: 'inherit',
    }
  );

  if (fallbackResult.status !== 0) {
    return fallbackResult.status ?? 1;
  }

  return 0;
}

function shouldSkipBrowserForKnownOomRisk() {
  const localModelPath = resolveModelPathForNative(modelPath);
  if (!localModelPath) {
    return null;
  }

  const stats = fs.statSync(localModelPath);
  if (stats.size <= MNN_BROWSER_SAFE_ONNX_MAX_BYTES) {
    return null;
  }

  return {
    localModelPath,
    modelBytes: stats.size,
    thresholdBytes: MNN_BROWSER_SAFE_ONNX_MAX_BYTES,
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let fallbackExitCode = null;

page.on('console', (msg) => {
  console.log(`[browser:${msg.type()}] ${msg.text()}`);
});

page.on('pageerror', (err) => {
  console.error(`[browser:pageerror] ${err.message}`);
});

try {
  const knownOomRisk = shouldSkipBrowserForKnownOomRisk();
  if (shouldFallbackNative && knownOomRisk) {
    console.error(
      `[guard] Skipping browser MNN export for ${knownOomRisk.localModelPath} ` +
        `because ${(knownOomRisk.modelBytes / (1024 * 1024)).toFixed(2)}MB > ` +
        `${(knownOomRisk.thresholdBytes / (1024 * 1024)).toFixed(2)}MB conservative browser threshold.`
    );
      fallbackExitCode = runNativeFallback(
      new Error(
        `MNN 浏览器转换前置保护已触发：当前只拦截超过 100MB 的输入；本次是为手动测试放宽的门槛，但浏览器侧仍可能 OOM。`
      )
    );
  } else {
    const targetUrl = `${baseUrl.replace(/\/$/, '')}/verify-onnx2mnn.html?model=${encodeURIComponent(modelPath)}`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => Boolean(window.__onnx2mnnResult), undefined, {
      timeout: 60000,
    });

    const result = await page.evaluate(() => window.__onnx2mnnResult);
    if (!result?.success) {
      throw new Error(result?.error || 'MNN conversion failed in browser');
    }

    const bytes = Buffer.from(result.output_base64, 'base64');
    fs.writeFileSync(outPath, bytes);

    console.log(
      JSON.stringify(
        {
          success: true,
          outPath,
          mnnBytes: bytes.byteLength,
        },
        null,
        2
      )
    );
  }
} catch (error) {
  const normalizedError =
    error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error));

  if (shouldFallbackNative && isRecoverableBrowserErrorMessage(normalizedError.message)) {
    fallbackExitCode = runNativeFallback(normalizedError);
  } else {
    throw normalizedError;
  }
} finally {
  await browser.close();
}

if (fallbackExitCode !== null) {
  process.exit(fallbackExitCode);
}
