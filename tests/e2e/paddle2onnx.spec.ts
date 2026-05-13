import { test, expect } from '@playwright/test';

test.describe('PaddlePaddle 输入格式', () => {
  test('默认显示 ONNX 输入格式，格式切换器存在', async ({ page }) => {
    await page.goto('/');

    const selector = page.getByTestId('input-format-selector');
    await expect(selector).toBeVisible();

    // Both buttons exist
    await expect(page.getByTestId('input-format-onnx')).toBeVisible();
    await expect(page.getByTestId('input-format-paddle')).toBeVisible();

    // Default is ONNX — standard upload area should be visible
    await expect(page.getByTestId('model-dropzone')).toBeVisible();
    await expect(page.getByTestId('paddle-input-panel')).not.toBeVisible();
  });

  test('切换到 PaddlePaddle 时显示 .pdmodel 和 .pdiparams 文件输入', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('input-format-paddle').click();

    await expect(page.getByTestId('paddle-input-panel')).toBeVisible();

    // Both file inputs are rendered
    await expect(page.getByTestId('pdmodel-file-input')).toBeAttached();
    await expect(page.getByTestId('pdiparams-file-input')).toBeAttached();

    // Upload labels visible
    await expect(page.getByTestId('pdmodel-upload-label')).toBeVisible();
    await expect(page.getByTestId('pdiparams-upload-label')).toBeVisible();

    // ONNX dropzone hidden
    await expect(page.getByTestId('model-dropzone')).not.toBeVisible();
  });

  test('PaddlePaddle 面板显示「转换为 ONNX」按钮', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('input-format-paddle').click();

    const convertBtn = page.getByTestId('paddle2onnx-convert-btn');
    await expect(convertBtn).toBeVisible();
    await expect(convertBtn).toContainText('转换为 ONNX');
    // Disabled until a .pdmodel file is selected
    await expect(convertBtn).toBeDisabled();
  });

  test('切换回 ONNX 时恢复标准上传区域', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('input-format-paddle').click();
    await expect(page.getByTestId('paddle-input-panel')).toBeVisible();

    await page.getByTestId('input-format-onnx').click();
    await expect(page.getByTestId('model-dropzone')).toBeVisible();
    await expect(page.getByTestId('paddle-input-panel')).not.toBeVisible();
  });

  test('标题随格式切换更新', async ({ page }) => {
    await page.goto('/');

    const uploadSection = page.getByTestId('upload-section');
    await expect(uploadSection).toContainText('上传 ONNX 模型');

    await page.getByTestId('input-format-paddle').click();
    await expect(uploadSection).toContainText('上传 PaddlePaddle 模型');

    await page.getByTestId('input-format-onnx').click();
    await expect(uploadSection).toContainText('上传 ONNX 模型');
  });
});
