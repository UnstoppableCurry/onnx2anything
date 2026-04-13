import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

export type ModelDimension = number | string;

// 模型信息接口
export interface ModelNode {
  name: string;
  opType: string;
  inputs: string[];
  outputs: string[];
  attributes?: Record<string, unknown>;
}

export interface ModelTensor {
  name: string;
  type: string;
  shape: ModelDimension[];
}

export interface ModelGraph {
  name: string;
  inputs: ModelTensor[];
  outputs: ModelTensor[];
  nodes: ModelNode[];
  initializers: ModelTensor[];
}

export interface ModelMetadata {
  irVersion: number;
  opsetVersion: number;
  producerName: string;
  producerVersion: string;
  domain: string;
  modelVersion: number;
  docString: string;
  graph: ModelGraph;
  metadata: {
    totalNodes: number;
    totalParameters: number;
    totalInitializers: number;
    fileSize: number;
    opsetImport: string[];
  };
}

type ModelInfoLoadingState = 'idle' | 'loading' | 'success' | 'error';

interface ModelInfoState {
  modelInfo: ModelMetadata | null;
  loadingState: ModelInfoLoadingState;
  error: string | null;
  progress: number;
}

interface UseModelInfoOptions {
  onSuccess?: (info: ModelMetadata) => void;
  onError?: (error: string) => void;
}

const decoder = new TextDecoder();

const TENSOR_TYPE_NAMES: Record<number, string> = {
  0: 'UNDEFINED',
  1: 'FLOAT',
  2: 'UINT8',
  3: 'INT8',
  4: 'UINT16',
  5: 'INT16',
  6: 'INT32',
  7: 'INT64',
  8: 'STRING',
  9: 'BOOL',
  10: 'FLOAT16',
  11: 'DOUBLE',
  12: 'UINT32',
  13: 'UINT64',
  14: 'COMPLEX64',
  15: 'COMPLEX128',
  16: 'BFLOAT16',
  17: 'FLOAT8E4M3FN',
  18: 'FLOAT8E4M3FNUZ',
  19: 'FLOAT8E5M2',
  20: 'FLOAT8E5M2FNUZ',
};

type ReaderResult<T> = {
  value: T;
  offset: number;
};

function ensureReadable(bytes: Uint8Array, offset: number, length: number): void {
  if (offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new Error('无效的 ONNX 文件格式');
  }
}

function readVarint(bytes: Uint8Array, startOffset: number): ReaderResult<number> {
  let offset = startOffset;
  let shift = 0;
  let value = 0;

  while (offset < bytes.length && shift < 64) {
    const byte = bytes[offset];
    value += (byte & 0x7f) * 2 ** shift;
    offset += 1;

    if ((byte & 0x80) === 0) {
      return { value, offset };
    }

    shift += 7;
  }

  throw new Error('无效的 ONNX 文件格式');
}

function readLengthDelimited(bytes: Uint8Array, startOffset: number): ReaderResult<Uint8Array> {
  const { value: length, offset } = readVarint(bytes, startOffset);
  ensureReadable(bytes, offset, length);
  return {
    value: bytes.subarray(offset, offset + length),
    offset: offset + length,
  };
}

function readString(bytes: Uint8Array, startOffset: number): ReaderResult<string> {
  const { value, offset } = readLengthDelimited(bytes, startOffset);
  return { value: decoder.decode(value), offset };
}

function skipField(bytes: Uint8Array, startOffset: number, wireType: number): number {
  switch (wireType) {
    case 0:
      return readVarint(bytes, startOffset).offset;
    case 1:
      ensureReadable(bytes, startOffset, 8);
      return startOffset + 8;
    case 2: {
      const { offset } = readLengthDelimited(bytes, startOffset);
      return offset;
    }
    case 5:
      ensureReadable(bytes, startOffset, 4);
      return startOffset + 4;
    default:
      throw new Error('无效的 ONNX 文件格式');
  }
}

function parsePackedVarints(bytes: Uint8Array): number[] {
  const values: number[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const item = readVarint(bytes, offset);
    values.push(item.value);
    offset = item.offset;
  }

  return values;
}

function parseTensorShape(bytes: Uint8Array): ModelDimension[] {
  const dimensions: ModelDimension[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    offset = key.offset;
    const fieldNumber = key.value >>> 3;
    const wireType = key.value & 0x07;

    if (fieldNumber === 1 && wireType === 2) {
      const dimension = readLengthDelimited(bytes, offset);
      offset = dimension.offset;

      let dimOffset = 0;
      let dimValue: ModelDimension | null = null;

      while (dimOffset < dimension.value.length) {
        const dimKey = readVarint(dimension.value, dimOffset);
        dimOffset = dimKey.offset;
        const dimFieldNumber = dimKey.value >>> 3;
        const dimWireType = dimKey.value & 0x07;

        if (dimFieldNumber === 1 && dimWireType === 0) {
          const parsedValue = readVarint(dimension.value, dimOffset);
          dimValue = parsedValue.value;
          dimOffset = parsedValue.offset;
        } else if (dimFieldNumber === 2 && dimWireType === 2) {
          const parsedValue = readString(dimension.value, dimOffset);
          dimValue = parsedValue.value;
          dimOffset = parsedValue.offset;
        } else {
          dimOffset = skipField(dimension.value, dimOffset, dimWireType);
        }
      }

      dimensions.push(dimValue ?? '?');
      continue;
    }

    offset = skipField(bytes, offset, wireType);
  }

  return dimensions;
}

function parseType(bytes: Uint8Array): { type: string; shape: ModelDimension[] } {
  let type = 'UNKNOWN';
  let shape: ModelDimension[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    offset = key.offset;
    const fieldNumber = key.value >>> 3;
    const wireType = key.value & 0x07;

    if (fieldNumber === 1 && wireType === 2) {
      const tensorType = readLengthDelimited(bytes, offset);
      offset = tensorType.offset;

      let tensorOffset = 0;
      while (tensorOffset < tensorType.value.length) {
        const tensorKey = readVarint(tensorType.value, tensorOffset);
        tensorOffset = tensorKey.offset;
        const tensorFieldNumber = tensorKey.value >>> 3;
        const tensorWireType = tensorKey.value & 0x07;

        if (tensorFieldNumber === 1 && tensorWireType === 0) {
          const elemType = readVarint(tensorType.value, tensorOffset);
          type = TENSOR_TYPE_NAMES[elemType.value] ?? `TYPE_${elemType.value}`;
          tensorOffset = elemType.offset;
        } else if (tensorFieldNumber === 2 && tensorWireType === 2) {
          const parsedShape = readLengthDelimited(tensorType.value, tensorOffset);
          shape = parseTensorShape(parsedShape.value);
          tensorOffset = parsedShape.offset;
        } else {
          tensorOffset = skipField(tensorType.value, tensorOffset, tensorWireType);
        }
      }

      continue;
    }

    offset = skipField(bytes, offset, wireType);
  }

  return { type, shape };
}

function parseValueInfo(bytes: Uint8Array): ModelTensor {
  let name = '';
  let type = 'UNKNOWN';
  let shape: ModelDimension[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    offset = key.offset;
    const fieldNumber = key.value >>> 3;
    const wireType = key.value & 0x07;

    if (fieldNumber === 1 && wireType === 2) {
      const parsedName = readString(bytes, offset);
      name = parsedName.value;
      offset = parsedName.offset;
    } else if (fieldNumber === 2 && wireType === 2) {
      const parsedType = readLengthDelimited(bytes, offset);
      const typeInfo = parseType(parsedType.value);
      type = typeInfo.type;
      shape = typeInfo.shape;
      offset = parsedType.offset;
    } else {
      offset = skipField(bytes, offset, wireType);
    }
  }

  return { name, type, shape };
}

function parseTensor(bytes: Uint8Array): ModelTensor {
  let name = '';
  let type = 'UNKNOWN';
  const shape: number[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    offset = key.offset;
    const fieldNumber = key.value >>> 3;
    const wireType = key.value & 0x07;

    if (fieldNumber === 1 && wireType === 0) {
      const dim = readVarint(bytes, offset);
      shape.push(dim.value);
      offset = dim.offset;
    } else if (fieldNumber === 1 && wireType === 2) {
      const packedDims = readLengthDelimited(bytes, offset);
      shape.push(...parsePackedVarints(packedDims.value));
      offset = packedDims.offset;
    } else if (fieldNumber === 2 && wireType === 0) {
      const dataType = readVarint(bytes, offset);
      type = TENSOR_TYPE_NAMES[dataType.value] ?? `TYPE_${dataType.value}`;
      offset = dataType.offset;
    } else if (fieldNumber === 8 && wireType === 2) {
      const parsedName = readString(bytes, offset);
      name = parsedName.value;
      offset = parsedName.offset;
    } else {
      offset = skipField(bytes, offset, wireType);
    }
  }

  return { name, type, shape };
}

function parseNode(bytes: Uint8Array): ModelNode {
  const inputs: string[] = [];
  const outputs: string[] = [];
  let name = '';
  let opType = 'Unknown';
  let offset = 0;

  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    offset = key.offset;
    const fieldNumber = key.value >>> 3;
    const wireType = key.value & 0x07;

    if (fieldNumber === 1 && wireType === 2) {
      const parsedInput = readString(bytes, offset);
      inputs.push(parsedInput.value);
      offset = parsedInput.offset;
    } else if (fieldNumber === 2 && wireType === 2) {
      const parsedOutput = readString(bytes, offset);
      outputs.push(parsedOutput.value);
      offset = parsedOutput.offset;
    } else if (fieldNumber === 3 && wireType === 2) {
      const parsedName = readString(bytes, offset);
      name = parsedName.value;
      offset = parsedName.offset;
    } else if (fieldNumber === 4 && wireType === 2) {
      const parsedOpType = readString(bytes, offset);
      opType = parsedOpType.value;
      offset = parsedOpType.offset;
    } else {
      offset = skipField(bytes, offset, wireType);
    }
  }

  return { name, opType, inputs, outputs };
}

function parseOpsetImport(bytes: Uint8Array): { domain: string; version: number } {
  let domain = '';
  let version = 0;
  let offset = 0;

  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    offset = key.offset;
    const fieldNumber = key.value >>> 3;
    const wireType = key.value & 0x07;

    if (fieldNumber === 1 && wireType === 2) {
      const parsedDomain = readString(bytes, offset);
      domain = parsedDomain.value;
      offset = parsedDomain.offset;
    } else if (fieldNumber === 2 && wireType === 0) {
      const parsedVersion = readVarint(bytes, offset);
      version = parsedVersion.value;
      offset = parsedVersion.offset;
    } else {
      offset = skipField(bytes, offset, wireType);
    }
  }

  return { domain, version };
}

function countTensorParameters(tensor: ModelTensor): number {
  if (tensor.shape.length === 0) {
    return 1;
  }

  return tensor.shape.reduce<number>((total, dim) => {
    if (typeof dim !== 'number' || Number.isNaN(dim)) {
      return total;
    }
    return total * dim;
  }, 1);
}

function parseGraph(bytes: Uint8Array): ModelGraph {
  const nodes: ModelNode[] = [];
  const inputs: ModelTensor[] = [];
  const outputs: ModelTensor[] = [];
  const initializers: ModelTensor[] = [];
  let name = 'main_graph';
  let offset = 0;

  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    offset = key.offset;
    const fieldNumber = key.value >>> 3;
    const wireType = key.value & 0x07;

    if (wireType !== 2 && fieldNumber !== 0) {
      offset = skipField(bytes, offset, wireType);
      continue;
    }

    if (fieldNumber === 1 && wireType === 2) {
      const node = readLengthDelimited(bytes, offset);
      nodes.push(parseNode(node.value));
      offset = node.offset;
    } else if (fieldNumber === 2 && wireType === 2) {
      const graphName = readString(bytes, offset);
      name = graphName.value || name;
      offset = graphName.offset;
    } else if (fieldNumber === 5 && wireType === 2) {
      const initializer = readLengthDelimited(bytes, offset);
      initializers.push(parseTensor(initializer.value));
      offset = initializer.offset;
    } else if (fieldNumber === 11 && wireType === 2) {
      const input = readLengthDelimited(bytes, offset);
      inputs.push(parseValueInfo(input.value));
      offset = input.offset;
    } else if (fieldNumber === 12 && wireType === 2) {
      const output = readLengthDelimited(bytes, offset);
      outputs.push(parseValueInfo(output.value));
      offset = output.offset;
    } else {
      offset = skipField(bytes, offset, wireType);
    }
  }

  const initializerNames = new Set(initializers.map((item) => item.name));

  return {
    name,
    inputs: inputs.filter((item) => !initializerNames.has(item.name)),
    outputs,
    nodes,
    initializers,
  };
}

export function parseONNXModel(buffer: ArrayBuffer, fileSize = buffer.byteLength): ModelMetadata {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength === 0) {
    throw new Error('文件为空');
  }

  let irVersion = 0;
  let producerName = '';
  let producerVersion = '';
  let domain = '';
  let modelVersion = 0;
  let docString = '';
  let graph: ModelGraph | null = null;
  const opsetImport: string[] = [];
  let opsetVersion = 0;
  let offset = 0;

  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    offset = key.offset;
    const fieldNumber = key.value >>> 3;
    const wireType = key.value & 0x07;

    if (fieldNumber === 1 && wireType === 0) {
      const parsedVersion = readVarint(bytes, offset);
      irVersion = parsedVersion.value;
      offset = parsedVersion.offset;
    } else if (fieldNumber === 2 && wireType === 2) {
      const parsedProducerName = readString(bytes, offset);
      producerName = parsedProducerName.value;
      offset = parsedProducerName.offset;
    } else if (fieldNumber === 3 && wireType === 2) {
      const parsedProducerVersion = readString(bytes, offset);
      producerVersion = parsedProducerVersion.value;
      offset = parsedProducerVersion.offset;
    } else if (fieldNumber === 4 && wireType === 2) {
      const parsedDomain = readString(bytes, offset);
      domain = parsedDomain.value;
      offset = parsedDomain.offset;
    } else if (fieldNumber === 5 && wireType === 0) {
      const parsedModelVersion = readVarint(bytes, offset);
      modelVersion = parsedModelVersion.value;
      offset = parsedModelVersion.offset;
    } else if (fieldNumber === 6 && wireType === 2) {
      const parsedDocString = readString(bytes, offset);
      docString = parsedDocString.value;
      offset = parsedDocString.offset;
    } else if (fieldNumber === 7 && wireType === 2) {
      const parsedGraph = readLengthDelimited(bytes, offset);
      graph = parseGraph(parsedGraph.value);
      offset = parsedGraph.offset;
    } else if (fieldNumber === 8 && wireType === 2) {
      const parsedOpset = readLengthDelimited(bytes, offset);
      const opset = parseOpsetImport(parsedOpset.value);
      const normalizedDomain = opset.domain || 'ai.onnx';
      opsetImport.push(`${normalizedDomain} v${opset.version}`);
      if (!opsetVersion && (!opset.domain || opset.domain === 'ai.onnx')) {
        opsetVersion = opset.version;
      }
      offset = parsedOpset.offset;
    } else {
      offset = skipField(bytes, offset, wireType);
    }
  }

  if (!graph || irVersion <= 0) {
    throw new Error('无效的 ONNX 文件格式');
  }

  const totalParameters = graph.initializers.reduce(
    (sum, tensor) => sum + countTensorParameters(tensor),
    0
  );

  return {
    irVersion,
    opsetVersion,
    producerName: producerName || 'Unknown',
    producerVersion,
    domain,
    modelVersion,
    docString,
    graph,
    metadata: {
      totalNodes: graph.nodes.length,
      totalParameters,
      totalInitializers: graph.initializers.length,
      fileSize,
      opsetImport,
    },
  };
}

/**
 * 获取模型信息 Hook
 *
 * 用于在 React 组件中获取 ONNX 模型的基本信息
 *
 * @example
 * ```tsx
 * const { modelInfo, isLoading, error, extractModelInfo } = useModelInfo({
 *   onSuccess: (info) => console.log('Model info:', info),
 * });
 *
 * // 使用
 * await extractModelInfo(file);
 * ```
 */
export function useModelInfo(options: UseModelInfoOptions = {}) {
  const { onSuccess, onError } = options;
  const abortControllerRef = useRef<AbortController | null>(null);

  const [state, setState] = useState<ModelInfoState>({
    modelInfo: null,
    loadingState: 'idle',
    error: null,
    progress: 0,
  });

  /**
   * 提取模型信息
   */
  const extractModelInfo = useCallback(
    async (file: File): Promise<void> => {
      // 取消之前的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setState({
        modelInfo: null,
        loadingState: 'loading',
        error: null,
        progress: 0,
      });

      try {
        // 更新进度
        setState((prev) => ({ ...prev, progress: 10 }));

        // 验证文件
        if (!file.name.endsWith('.onnx')) {
          throw new Error('请上传 ONNX 格式文件');
        }

        setState((prev) => ({ ...prev, progress: 30 }));

        // 读取文件
        const arrayBuffer = await file.arrayBuffer();

        setState((prev) => ({ ...prev, progress: 50 }));

        // 验证文件大小
        if (arrayBuffer.byteLength === 0) {
          throw new Error('文件为空');
        }

        setState((prev) => ({ ...prev, progress: 70 }));

        const modelInfo = parseONNXModel(arrayBuffer, file.size);

        setState({
          modelInfo,
          loadingState: 'success',
          error: null,
          progress: 100,
        });

        onSuccess?.(modelInfo);
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : '无法解析模型信息';

        setState({
          modelInfo: null,
          loadingState: 'error',
          error: errorMsg,
          progress: 0,
        });

        onError?.(errorMsg);
        toast.error(`模型解析失败: ${errorMsg}`);
      }
    },
    [onSuccess, onError]
  );

  /**
   * 从 ArrayBuffer 提取模型信息
   */
  const extractModelInfoFromBuffer = useCallback(
    async (buffer: ArrayBuffer, fileName: string): Promise<void> => {
      const mockFile = new File([buffer], fileName, {
        type: 'application/octet-stream',
      });
      await extractModelInfo(mockFile);
    },
    [extractModelInfo]
  );

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setState({
      modelInfo: null,
      loadingState: 'idle',
      error: null,
      progress: 0,
    });
  }, []);

  /**
   * 清除错误
   */
  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
      loadingState: prev.loadingState === 'error' ? 'idle' : prev.loadingState,
    }));
  }, []);

  return {
    // 状态
    modelInfo: state.modelInfo,
    isLoading: state.loadingState === 'loading',
    isSuccess: state.loadingState === 'success',
    isError: state.loadingState === 'error',
    loadingState: state.loadingState,
    error: state.error,
    progress: state.progress,

    // 方法
    extractModelInfo,
    extractModelInfoFromBuffer,
    reset,
    clearError,
  };
}

export default useModelInfo;
