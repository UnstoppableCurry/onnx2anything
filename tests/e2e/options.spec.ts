import { test, expect } from '@playwright/test';
import { join } from 'path';

const SMALL_ONNX_MODEL = join(process.cwd(), 'apps/web/public/verify/generated/add_const.onnx');

test.describe('转换选项 smoke', () => {
  test.setTimeout(180000);

  test('量化选择器 - MNN 支持 fp16 和 int8', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="model-file-input"]').setInputFiles(SMALL_ONNX_MODEL);
    await page.getByTestId('target-format-select').selectOption('mnn');
    const quantSelect = page.getByTestId('quantization-select');
    await expect(quantSelect).toBeVisible();
    const options = await quantSelect.locator('option').allTextContents();
    expect(options.some(o => o.includes('fp16') || o.includes('FP16'))).toBe(true);
    expect(options.some(o => o.includes('int8') || o.includes('INT8'))).toBe(true);
  });

  test('量化选择器 - TNN 只支持 fp16', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('target-format-select').selectOption('tnn');
    const quantSelect = page.getByTestId('quantization-select');
    await expect(quantSelect).toBeVisible();
    const options = await quantSelect.locator('option').allTextContents();
    expect(options.some(o => o.includes('fp16') || o.includes('FP16'))).toBe(true);
    expect(options.some(o => o.includes('int8') || o.includes('INT8'))).toBe(false);
  });

  test('量化选择器 - NCNN 支持 fp16', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="model-file-input"]').setInputFiles(SMALL_ONNX_MODEL);
    await page.getByTestId('target-format-select').selectOption('ncnn');
    const quantSelect = page.getByTestId('quantization-select');
    await expect(quantSelect).toBeVisible();
    const options = await quantSelect.locator('option').allTextContents();
    expect(options.some(o => o.includes('fp16') || o.includes('FP16'))).toBe(true);
    expect(options.some(o => o.includes('int8') || o.includes('INT8'))).toBe(false);
  });

  test('NCNN FP16 量化转换可完成', async ({ page }) => {
    test.setTimeout(300000);
    await page.goto('/');
    await page.locator('[data-testid="model-file-input"]').setInputFiles(SMALL_ONNX_MODEL);
    await expect(page.getByTestId('model-file-card')).toBeVisible();
    await page.getByTestId('target-format-select').selectOption('ncnn');
    await expect(page.getByTestId('quantization-select')).toBeVisible();
    await page.getByTestId('quantization-select').selectOption('fp16');
    await page.getByTestId('start-conversion').click();
    await expect(page.getByTestId('conversion-progress')).toBeVisible({ timeout: 10000 });
    // Wait for either success (download-panel) or error
    await expect(
      page.getByTestId('download-panel').or(page.getByTestId('conversion-error'))
    ).toBeVisible({ timeout: 240000 });
    await expect(page.getByTestId('download-panel')).toContainText('结果已准备好');
  });

  test('MNN FP16 量化转换可完成', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="model-file-input"]').setInputFiles(SMALL_ONNX_MODEL);
    await page.getByTestId('target-format-select').selectOption('mnn');
    await page.getByTestId('quantization-select').selectOption('fp16');
    await page.getByTestId('start-conversion').click();
    await expect(page.getByTestId('download-panel')).toBeVisible({ timeout: 120000 });
    await expect(page.getByTestId('download-panel')).toContainText('结果已准备好');
  });

  test('onnxsim checkbox 存在且可点击', async ({ page }) => {
    await page.goto('/');
    const checkbox = page.getByTestId('simplify-checkbox');
    await expect(checkbox).toBeVisible();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });

  test('启用 onnxsim 后 NCNN 转换可完成', async ({ page }) => {
    test.setTimeout(300000); // onnxsim (Pyodide) + NCNN both need to load
    await page.goto('/');
    await page.locator('[data-testid="model-file-input"]').setInputFiles(SMALL_ONNX_MODEL);
    await page.getByTestId('simplify-checkbox').check();
    await page.getByTestId('target-format-select').selectOption('ncnn');
    await page.getByTestId('start-conversion').click();
    await expect(page.getByTestId('download-panel')).toBeVisible({ timeout: 270000 });
    await expect(page.getByTestId('download-panel')).toContainText('结果已准备好');
  });
});
