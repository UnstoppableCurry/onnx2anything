import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const modelPath =
  process.argv[3] ||
  '/tmp/dbnet_compare/PP-OCRv3_mobile_det_no_identity.onnx';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('console', (msg) => {
  console.log(`[browser:${msg.type()}] ${msg.text()}`);
});

page.on('pageerror', (err) => {
  console.error(`[browser:pageerror] ${err.message}`);
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });

  await page.locator('input[type="file"]').setInputFiles(modelPath);
  await page.getByText('TensorFlow Lite').waitFor({
    timeout: 30000,
  });
  await page.waitForTimeout(1000);

  await page.locator("//span[normalize-space()='NCNN']/ancestor::button[1]").click({ force: true });
  await page.getByRole('button', { name: '开始转换' }).click();

  const downloadButton = page.getByRole('button', { name: '下载转换后的模型' });
  await downloadButton.waitFor({ timeout: 120000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);

  const suggestedFilename = download.suggestedFilename();
  const failureText = await page.locator('body').textContent();

  console.log(
    JSON.stringify(
      {
        success: true,
        baseUrl,
        modelPath: path.resolve(modelPath),
        suggestedFilename,
        bodySnippet: failureText?.slice(0, 500),
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
