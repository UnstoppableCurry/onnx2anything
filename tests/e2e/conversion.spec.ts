import { test, expect, type Page } from '@playwright/test';
import { join } from 'path';

const SMALL_ONNX_MODEL = join(
  process.cwd(),
  'apps/web/public/verify/generated/add_const.onnx'
);

async function uploadOnnxModel(page: Page, visitPage = true) {
  if (visitPage) {
    await page.goto('/');
  }
  await page.locator('[data-testid="model-file-input"]').setInputFiles(SMALL_ONNX_MODEL);
  await expect(page.getByTestId('model-file-card')).toContainText('add_const.onnx');
}

async function runBrowserConversion(
  page: Page,
  targetFormat: 'ncnn' | 'mnn',
  options?: { visitPage?: boolean }
) {
  await uploadOnnxModel(page, options?.visitPage ?? true);
  await page.getByTestId('target-format-select').selectOption(targetFormat);
  await page.getByTestId('start-conversion').click();
  await expect(page.getByTestId('conversion-progress')).toBeVisible();
  await expect(page.getByTestId('download-panel')).toBeVisible({ timeout: 120000 });
}

test.describe('网站 demo 转换 smoke', () => {
  test.setTimeout(180000);

  test('NCNN 浏览器直转可完成并下载', async ({ page }) => {
    await runBrowserConversion(page, 'ncnn');

    await expect(page.getByTestId('download-panel')).toContainText('转换成功');
    await expect(page.getByTestId('download-panel')).toContainText('model.ncnn.zip');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-result').click(),
    ]);

    expect(download.suggestedFilename()).toBe('model.ncnn.zip');
  });

  test('MNN 浏览器直转可完成并下载', async ({ page }) => {
    await runBrowserConversion(page, 'mnn');

    await expect(page.getByTestId('download-panel')).toContainText('转换成功');
    await expect(page.getByTestId('download-panel')).toContainText('model.mnn');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-result').click(),
    ]);

    expect(download.suggestedFilename()).toBe('model.mnn');
  });

  test('同一页面可连续转换两次', async ({ page }) => {
    await runBrowserConversion(page, 'ncnn');
    await page.getByTestId('reset-conversion').click();

    await runBrowserConversion(page, 'ncnn', { visitPage: false });
    await expect(page.getByTestId('download-panel')).toContainText('model.ncnn.zip');
  });

  test('连续双击转换按钮不会卡住', async ({ page }) => {
    await uploadOnnxModel(page);
    await page.getByTestId('target-format-select').selectOption('ncnn');
    await page.getByTestId('start-conversion').dblclick();
    await expect(page.getByTestId('download-panel')).toBeVisible({ timeout: 120000 });
    await expect(page.getByTestId('download-panel')).toContainText('model.ncnn.zip');
  });
});
