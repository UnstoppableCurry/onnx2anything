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

  test('ONNX → PaddleLite 浏览器转换会生成可下载的 .nb 文件', async ({ page }) => {
    await uploadAndSelectFormat(page, 'paddlelite');
    await page.getByTestId('start-conversion').click();
    await expect(page.getByTestId('conversion-progress')).toBeVisible();

    await expect(page.getByTestId('download-section')).toBeVisible({ timeout: 120000 });
    await expect(page.getByTestId('download-panel')).toContainText('结果已准备好');
    await expect(page.getByTestId('download-panel')).toContainText('model.nb');
    await expect(page.getByTestId('conversion-error')).not.toBeVisible();
  });
});
