import React, { useState } from 'react';
import {
  Layers,
  Hash,
  Box,
  GitBranch,
  AlertCircle,
  FileJson,
  Cpu,
  ArrowRight,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn, formatNumber, formatFileSize } from '../utils/cn';
import type { ModelDimension } from '../hooks/useModelInfo';

export interface ModelNode {
  name: string;
  opType: string;
  inputs: string[];
  outputs: string[];
  attributes?: Record<string, unknown>;
}

export interface ModelInfo {
  irVersion: number;
  opsetVersion: number;
  producerName: string;
  producerVersion: string;
  domain: string;
  modelVersion: number;
  docString: string;
  graph: {
    name: string;
    inputs: { name: string; type: string; shape: ModelDimension[] }[];
    outputs: { name: string; type: string; shape: ModelDimension[] }[];
    nodes: ModelNode[];
    initializers: { name: string; type: string; shape: ModelDimension[] }[];
  };
  metadata: {
    totalNodes: number;
    totalParameters: number;
    totalInitializers: number;
    fileSize: number;
    opsetImport: string[];
  };
}

interface ModelViewerProps {
  modelInfo: ModelInfo | null;
  fileSize?: number;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * 模型结构查看器组件
 * 显示 ONNX 模型的层数、参数数量、输入输出等结构信息
 */
export const ModelViewer: React.FC<ModelViewerProps> = ({
  modelInfo,
  fileSize,
  isLoading = false,
  error = null,
  className,
}) => {
  const [expanded, setExpanded] = useState(false);

  // 计算节点类型统计
  const nodeTypeStats = React.useMemo(() => {
    if (!modelInfo) return {};
    const stats: Record<string, number> = {};
    modelInfo.graph.nodes.forEach((node) => {
      stats[node.opType] = (stats[node.opType] || 0) + 1;
    });
    return stats;
  }, [modelInfo]);

  // 获取前 N 种最常见的节点类型
  const topNodeTypes = React.useMemo(() => {
    return Object.entries(nodeTypeStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [nodeTypeStats]);

  if (isLoading) {
    return (
      <div
        className={cn(
          'w-full p-6 bg-muted/50 rounded-xl border border-border animate-pulse',
          className
        )}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-muted" />
          <div className="space-y-2">
            <div className="w-32 h-4 bg-muted rounded" />
            <div className="w-24 h-3 bg-muted rounded" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="h-16 bg-muted rounded-lg" />
          <div className="h-16 bg-muted rounded-lg" />
          <div className="h-16 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          'w-full p-4 bg-destructive/5 border border-destructive/20 rounded-xl',
          className
        )}
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive">无法解析模型</p>
            <p className="text-sm text-destructive/80 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!modelInfo) {
    return (
      <div
        className={cn(
          'w-full p-6 bg-muted/30 rounded-xl border border-dashed border-border text-center',
          className
        )}
      >
        <Box className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">上传模型后查看结构信息</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'w-full bg-card rounded-xl border border-border overflow-hidden',
        className
      )}
    >
      {/* 头部信息 */}
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <FileJson className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{modelInfo.graph.name || 'ONNX Model'}</h3>
            <p className="text-xs text-muted-foreground">
              {modelInfo.producerName} {modelInfo.producerVersion}
            </p>
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="p-4 grid grid-cols-2 gap-3">
        {/* 节点数 */}
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Layers className="w-3.5 h-3.5" />
            <span className="text-xs">节点数</span>
          </div>
          <p className="text-lg font-semibold">
            {formatNumber(modelInfo.metadata.totalNodes)}
          </p>
        </div>

        {/* 参数量 */}
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Hash className="w-3.5 h-3.5" />
            <span className="text-xs">参数量</span>
          </div>
          <p className="text-lg font-semibold">
            {formatNumber(modelInfo.metadata.totalParameters)}
          </p>
        </div>

        {/* 模型版本 */}
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <FileJson className="w-3.5 h-3.5" />
            <span className="text-xs">IR 版本</span>
          </div>
          <p className="text-lg font-semibold">{modelInfo.irVersion}</p>
        </div>

        {/* 文件大小 */}
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Box className="w-3.5 h-3.5" />
            <span className="text-xs">文件大小</span>
          </div>
          <p className="text-lg font-semibold">
            {fileSize ? formatFileSize(fileSize) : 'Unknown'}
          </p>
        </div>
      </div>

      {/* Opset 信息 */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
          <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Opset: {modelInfo.opsetVersion}
          </span>
          {modelInfo.metadata.opsetImport.length > 0 && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">
                {modelInfo.metadata.opsetImport.join(', ')}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 输入输出信息 */}
      <div className="px-4 pb-4">
        <div className="space-y-2">
          {/* 输入 */}
          <div className="p-3 bg-green-50/50 dark:bg-green-900/10 rounded-lg border border-green-200/50 dark:border-green-800/30">
            <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-2">
              输入 ({modelInfo.graph.inputs.length})
            </p>
            <div className="space-y-1">
              {modelInfo.graph.inputs.slice(0, 2).map((input, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span className="truncate flex-1">{input.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded">
                    {input.type}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    [{input.shape.join(', ')}]
                  </span>
                </div>
              ))}
              {modelInfo.graph.inputs.length > 2 && (
                <p className="text-xs text-muted-foreground">
                  +{modelInfo.graph.inputs.length - 2} 更多输入
                </p>
              )}
            </div>
          </div>

          {/* 箭头 */}
          <div className="flex justify-center">
            <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" />
          </div>

          {/* 输出 */}
          <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-200/50 dark:border-blue-800/30">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-2">
              输出 ({modelInfo.graph.outputs.length})
            </p>
            <div className="space-y-1">
              {modelInfo.graph.outputs.slice(0, 2).map((output, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span className="truncate flex-1">{output.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded">
                    {output.type}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    [{output.shape.join(', ')}]
                  </span>
                </div>
              ))}
              {modelInfo.graph.outputs.length > 2 && (
                <p className="text-xs text-muted-foreground">
                  +{modelInfo.graph.outputs.length - 2} 更多输出
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 节点类型统计 */}
      {topNodeTypes.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
          >
            <span className="text-sm font-medium">节点类型分布</span>
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {expanded && (
            <div className="px-4 pb-4 space-y-2">
              {topNodeTypes.map(([type, count]) => (
                <div
                  key={type}
                  className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm"
                >
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{type}</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatNumber(count)}
                  </span>
                </div>
              ))}
              {Object.keys(nodeTypeStats).length > 5 && (
                <p className="text-xs text-muted-foreground text-center">
                  还有 {Object.keys(nodeTypeStats).length - 5} 种节点类型
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ModelViewer;
