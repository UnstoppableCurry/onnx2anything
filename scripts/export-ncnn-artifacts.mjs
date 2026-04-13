import fs from 'node:fs';
import process from 'node:process';
import { chromium } from 'playwright';

const [, , baseUrl, modelPath, paramOut, binOut] = process.argv;

if (!baseUrl || !modelPath || !paramOut || !binOut) {
  console.error(
    'Usage: node scripts/export-ncnn-artifacts.mjs <baseUrl> <modelPath> <paramOut> <binOut>'
  );
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('console', (msg) => {
  console.log(`[browser:${msg.type()}] ${msg.text()}`);
});

page.on('pageerror', (err) => {
  console.error(`[browser:pageerror] ${err.message}`);
});

try {
  const targetUrl = `${baseUrl.replace(/\/$/, '')}/verify-onnx2ncnn.html?model=${encodeURIComponent(modelPath)}`;
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });

  await page.waitForFunction(() => Boolean(window.__onnx2ncnnResult), undefined, {
    timeout: 60000,
  });

  const result = await page.evaluate(() => window.__onnx2ncnnResult);

  if (!result?.success) {
    throw new Error(result?.error || 'NCNN conversion failed in browser');
  }

  fs.writeFileSync(paramOut, Buffer.from(result.param_base64, 'base64'));
  fs.writeFileSync(binOut, Buffer.from(result.bin_base64, 'base64'));

  console.log(
    JSON.stringify(
      {
        success: true,
        paramOut,
        binOut,
        paramBytes: Buffer.from(result.param_base64, 'base64').byteLength,
        binBytes: Buffer.from(result.bin_base64, 'base64').byteLength,
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
