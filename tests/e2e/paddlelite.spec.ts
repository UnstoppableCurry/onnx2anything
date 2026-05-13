import { test, expect, type Page } from '@playwright/test';
import { join } from 'path';

const SMALL_ONNX_MODEL = join(
  process.cwd(),
  'apps/web/public/verify/generated/add_const.onnx'
);

async function uploadAndSelectFormat(page: Page, format: string) {
  await page.goto('/');
  await page.locator('[data-testid="model-file-input"]').setInputFiles(SMALL_ONNX_MODEL);
  await expect(page.getByTestId('model-file-card')).toContainText('add_const.onnx');
  await page.getByTestId('target-format-select').selectOption(format);
}

test.describe('PaddleLite 格式', () => {
  test.setTimeout(120000);

  test('PaddleLite 选项在格式选择器中可见', async ({ page }) => {
    await page.goto('/');
    const select = page.getByTestId('target-format-select');
    await expect(select).toBeVisible();
    const options = await select.locator('option').allTextContents();
    const hasPaddleLite = options.some(
      (t) => t.toLowerCase().includes('paddlelite') || t.toLowerCase().includes('paddle lite')
    );
    expect(hasPaddleLite, `PaddleLite not found in options: ${options.join(', ')}`).toBe(true);
  });

  test('选择 PaddleLite 格式后可触发转换按钮', async ({ page }) => {
    await uploadAndSelectFormat(page, 'paddlelite');
    const convertBtn = page.getByTestId('start-conversion');
    await expect(convertBtn).toBeVisible();
    await expect(convertBtn).toBeEnabled();
  });

  test('ONNX → PaddleLite 转换返回明确错误（非崩溃）', async ({ page }) => {
    await uploadAndSelectFormat(page, 'paddlelite');
    await page.getByTestId('start-conversion').click();
    await expect(page.getByTestId('conversion-progress')).toBeVisible();

    // Should show error (not success), since ONNX→PaddleLite is not supported in browser yet
    await expect(page.getByTestId('conversion-error')).toBeVisible({ timeout: 90000 });

    const errorText = await page.getByTestId('conversion-error').innerText();
    // Error should be informative (not a generic JS crash)
    expect(errorText.length).toBeGreaterThan(10);
    // Should NOT be a generic unhandled JS error
    expect(errorText).not.toMatch(/TypeError|undefined is not|Cannot read/);
  });

  test('PaddleLite 转换错误提示含替代方案说明', async ({ page }) => {
    await uploadAndSelectFormat(page, 'paddlelite');
    await page.getByTestId('start-conversion').click();
    await expect(page.getByTestId('conversion-error')).toBeVisible({ timeout: 90000 });

    const errorText = await page.getByTestId('conversion-error').innerText();
    // Error message should mention either PaddleLite limitation or native export
    const isInformative =
      errorText.includes('Paddle') ||
      errorText.includes('paddle') ||
      errorText.includes('native') ||
      errorText.includes('not loaded') ||
      errorText.includes('unavailable') ||
      errorText.includes('wasm toolchain');
    expect(isInformative).toBe(true);
  });
});
