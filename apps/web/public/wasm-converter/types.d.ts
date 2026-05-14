
// Auto-generated TypeScript types for WASM Converter
// Generated: 2026-05-14T01:21:14.218Z

export interface PythonModule {
  path: string;
  content: string; // base64
  size: number;
}

export interface Manifest {
  version: string;
  generated: string;
  modules: Record<string, PythonModule>;
}

export interface ConversionOptions {
  targetFormat: 'tflite' | 'openvino' | 'ncnn' | 'mnn' | 'paddlelite';
  quantization?: 'none' | 'fp16' | 'int8' | 'dynamic';
  optimization?: 'none' | 'basic' | 'aggressive';
  dynamicShapes?: boolean;
  verbose?: boolean;
}

export interface ConversionResult {
  buffer: ArrayBuffer;
  format: string;
  metadata: {
    sourceFormat: string;
    targetFormat: string;
    sourceSize: number;
    targetSize: number;
    opsetVersion?: number;
    irVersion?: number;
  };
  warnings?: string[];
}

export type WorkerMessageType =
  | 'ready'
  | 'progress'
  | 'complete'
  | 'error'
  | 'cancelled';

export interface WorkerMessage {
  type: WorkerMessageType;
  stage?: string;
  percent?: number;
  message?: string;
  result?: ConversionResult;
  error?: string;
}
