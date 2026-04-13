import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173';
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
  await page.goto(`${baseUrl.replace(/\/$/, '')}/verify-paddlelite-opt.html`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });

  await page.waitForFunction(() => Boolean(window.__paddleliteOptSmokeResult), undefined, {
    timeout: 60000,
  });

  const result = await page.evaluate(() => window.__paddleliteOptSmokeResult);
  console.log('RESULT_START');
  console.log(JSON.stringify(result, null, 2));
  console.log('RESULT_END');
  console.log('LOGS_START');
  for (const line of logs) {
    console.log(line);
  }
  console.log('LOGS_END');

  if (!result?.success) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
