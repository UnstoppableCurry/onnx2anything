export const MAX_MODEL_FILE_SIZE_MB = 1024;
export const MAX_MODEL_FILE_SIZE_BYTES = MAX_MODEL_FILE_SIZE_MB * 1024 * 1024;

export function getModelSizeLimitMessage(): string {
  return `当前仅支持转换权重不超过 ${MAX_MODEL_FILE_SIZE_MB}MB（1GB）的单个 ONNX 模型文件`;
}
