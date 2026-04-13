import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs = [];

page.on('console', (msg) => {
  logs.push(`${msg.type()}: ${msg.text()}`);
});

page.on('pageerror', (err) => {
  logs.push(`pageerror: ${err.message}`);
});

try {
  await page.goto('http://127.0.0.1:8766/verify-onnx2ncnn.html', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });

  const text = await page.locator('#output').textContent({ timeout: 60000 });

  console.log('OUTPUT_START');
  console.log(text);
  console.log('OUTPUT_END');
  console.log('LOGS_START');
  for (const line of logs) {
    console.log(line);
  }
  console.log('LOGS_END');
} finally {
  await browser.close();
}
