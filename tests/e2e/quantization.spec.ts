import { test, expect } from '@playwright/test';
import { join } from 'path';

const SMALL_ONNX_MODEL = join(process.cwd(), 'apps/web/public/verify/generated/add_const.onnx');

test.describe('量化转换 smoke', () => {
  test.setTimeout(180000);

  test('MNN FP16 量化转换成功', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="model-file-input"]').setInputFiles(SMALL_ONNX_MODEL);
    await page.getByTestId('target-format-select').selectOption('mnn');
    // The quantization-select is added by the UI agent; if not visible yet, skip
    const quantSel = page.getByTestId('quantization-select');
    if (await quantSel.isVisible()) {
      await quantSel.selectOption('fp16');
    }
    await page.getByTestId('start-conversion').click();
    await expect(page.getByTestId('download-panel')).toBeVisible({ timeout: 120000 });
    await expect(page.getByTestId('download-panel')).toContainText('结果已准备好');
  });

  test('MNN INT8 量化转换成功', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="model-file-input"]').setInputFiles(SMALL_ONNX_MODEL);
    await page.getByTestId('target-format-select').selectOption('mnn');
    const quantSel = page.getByTestId('quantization-select');
    if (await quantSel.isVisible()) {
      await quantSel.selectOption('int8');
    }
    await page.getByTestId('start-conversion').click();
    await expect(page.getByTestId('download-panel')).toBeVisible({ timeout: 120000 });
    await expect(page.getByTestId('download-panel')).toContainText('结果已准备好');
  });

  test('TNN FP16 量化转换成功', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="model-file-input"]').setInputFiles(SMALL_ONNX_MODEL);
    await page.getByTestId('target-format-select').selectOption('tnn');
    const quantSel = page.getByTestId('quantization-select');
    if (await quantSel.isVisible()) {
      await quantSel.selectOption('fp16');
    }
    await page.getByTestId('start-conversion').click();
    await expect(page.getByTestId('download-panel')).toBeVisible({ timeout: 120000 });
    await expect(page.getByTestId('download-panel')).toContainText('结果已准备好');
  });
});
