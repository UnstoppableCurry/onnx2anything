import { test, expect } from '@playwright/test';
import { join } from 'path';

const SMALL_ONNX_MODEL = join(
  process.cwd(),
  'apps/web/public/verify/generated/add_const.onnx'
);

test.describe('网站 demo 基础交互', () => {
  test('首页只暴露当前真实浏览器能力', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/ONNX2Anything/);
    await expect(page.getByTestId('hero-section')).toContainText('上传 ONNX → 选择格式 → 点击转换');
    await expect(page.getByTestId('upload-section')).toContainText('1. 上传 ONNX 模型');
    await expect(page.getByTestId('conversion-section')).toContainText('2. 选择输出格式并开始转换');

    const options = await page
      .getByTestId('target-format-select')
      .locator('option')
      .evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value));

    expect(options).toEqual(['ncnn', 'mnn', 'tnn', 'tengine']);
  });

  test('上传 ONNX 后会显示模型摘要并可重置', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('model-file-input').setInputFiles(SMALL_ONNX_MODEL);

    await expect(page.getByTestId('model-file-card')).toContainText('add_const.onnx');
    await expect(page.getByTestId('model-summary')).toContainText('add_const.onnx');

    await page.getByTestId('clear-model-file').click();
    await expect(page.getByTestId('model-file-card')).toHaveCount(0);
  });
});
