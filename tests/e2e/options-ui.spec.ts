import { test, expect } from '@playwright/test';
import { join } from 'path';

const SMALL_ONNX_MODEL = join(process.cwd(), 'apps/web/public/verify/generated/add_const.onnx');

test.describe('转换选项 UI', () => {
  test('量化选择器在 MNN 时可见，显示 fp16 和 int8', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('target-format-select').selectOption('mnn');
    const sel = page.getByTestId('quantization-select');
    await expect(sel).toBeVisible();
    const opts = await sel.locator('option').allTextContents();
    expect(opts.some(o => /fp16/i.test(o))).toBe(true);
    expect(opts.some(o => /int8/i.test(o))).toBe(true);
  });

  test('量化选择器在 TNN 时可见，只有 fp16', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('target-format-select').selectOption('tnn');
    const sel = page.getByTestId('quantization-select');
    await expect(sel).toBeVisible();
    const opts = await sel.locator('option').allTextContents();
    expect(opts.some(o => /fp16/i.test(o))).toBe(true);
    expect(opts.some(o => /int8/i.test(o))).toBe(false);
  });

  test('量化选择器在 NCNN 时不显示', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('target-format-select').selectOption('ncnn');
    await expect(page.getByTestId('quantization-select')).not.toBeVisible();
  });

  test('切换格式时量化选项自动重置', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('target-format-select').selectOption('mnn');
    await page.getByTestId('quantization-select').selectOption('fp16');
    // Switch to ncnn which doesn't support fp16
    await page.getByTestId('target-format-select').selectOption('ncnn');
    // quantization-select should not be visible (ncnn has no quant options)
    await expect(page.getByTestId('quantization-select')).not.toBeVisible();
    // Switch back to mnn — should be reset to 'none'
    await page.getByTestId('target-format-select').selectOption('mnn');
    const sel = page.getByTestId('quantization-select');
    await expect(sel).toBeVisible();
    await expect(sel).toHaveValue('none');
  });

  test('onnxsim checkbox 存在且可勾选', async ({ page }) => {
    await page.goto('/');
    const checkbox = page.getByTestId('simplify-checkbox');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });
});
