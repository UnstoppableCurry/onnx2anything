import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseONNXModel } from '@/hooks/useModelInfo';

function readFixture(relativePath: string): ArrayBuffer {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const file = fs.readFileSync(absolutePath);
  const view = new Uint8Array(file);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

describe('parseONNXModel', () => {
  it('parses the DBNet fixture without treating it as an invalid ONNX file', () => {
    const buffer = readFixture('apps/web/public/verify/generated/ppocrv3_dbnet_no_identity.onnx');
    const model = parseONNXModel(buffer);

    expect(model.irVersion).toBe(10);
    expect(model.opsetVersion).toBe(12);
    expect(model.graph.name).toBe('PaddlePaddle Graph in PIR mode');
    expect(model.metadata.totalNodes).toBe(256);
    expect(model.metadata.totalInitializers).toBe(300);
    expect(model.metadata.totalParameters).toBe(592649);
    expect(model.graph.inputs).toEqual([
      {
        name: 'x',
        type: 'FLOAT',
        shape: ['DynamicDimension.0', 3, 'DynamicDimension.1', 'DynamicDimension.2'],
      },
    ]);
    expect(model.graph.outputs).toEqual([
      {
        name: 'fetch_name_0',
        type: 'FLOAT',
        shape: [
          'ConvTranspose_311_o0__d0',
          1,
          'ConvTranspose_311_o0__d2',
          'ConvTranspose_311_o0__d3',
        ],
      },
    ]);
    expect(model.metadata.opsetImport).toEqual(['ai.onnx v12']);
  });

  it('parses a static-shape YOLO fixture and keeps producer metadata', () => {
    const buffer = readFixture('apps/web/public/verify/generated/yolov5n.onnx');
    const model = parseONNXModel(buffer);

    expect(model.irVersion).toBe(10);
    expect(model.producerName).toBe('pytorch');
    expect(model.producerVersion).toBe('2.11.0');
    expect(model.graph.name).toBe('main_graph');
    expect(model.metadata.totalNodes).toBe(236);
    expect(model.graph.inputs[0]).toEqual({
      name: 'images',
      type: 'FLOAT',
      shape: [1, 3, 640, 640],
    });
    expect(model.graph.outputs[0]).toEqual({
      name: 'output0',
      type: 'FLOAT',
      shape: [1, 25200, 85],
    });
  });

  it('rejects arbitrary binary data', () => {
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    expect(() => parseONNXModel(buffer)).toThrow('无效的 ONNX 文件格式');
  });
});
