import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { performance } from 'perf_hooks';
import {
  createYOLOv5nMock,
  createYOLOv8nMock,
  createResNet50Mock,
  measureTime,
} from '../utils/test-helpers';
import { convertModel } from '@/utils/converter';

// 性能基准配置
const BENCHMARK_CONFIG = {
  // 转换时间目标 (毫秒)
  targets: {
    yolov5n: {
      tflite: 30000,
      openvino: 40000,
    },
    yolov8n: {
      tflite: 45000,
      openvino: 55000,
    },
    resnet50: {
      tflite: 60000,
      openvino: 80000,
    },
  },
  // 内存限制 (MB)
  memoryLimits: {
    yolov5n: 200,
    yolov8n: 300,
    resnet50: 500,
  },
  // 文件大小减少目标 (%)
  sizeReductionTargets: {
    tflite: 30,
    fp16: 50,
    int8: 75,
  },
};

// 性能测试结果存储
interface BenchmarkResult {
  model: string;
  format: string;
  quantization: string;
  duration: number;
  targetDuration: number;
  passed: boolean;
  memoryUsage?: number;
  outputSize?: number;
  inputSize?: number;
  sizeReduction?: number;
}

const benchmarkResults: BenchmarkResult[] = [];

describe('转换性能基准测试', () => {
  beforeAll(() => {
    console.log('\n🏁 开始性能基准测试...\n');
  });

  afterAll(() => {
    // 生成性能报告
    generateBenchmarkReport();
  });

  describe('YOLOv5n 转换性能', () => {
    it('应该能在 30 秒内完成 TFLite 转换', async () => {
      const modelBuffer = createYOLOv5nMock();
      const targetDuration = BENCHMARK_CONFIG.targets.yolov5n.tflite;

      const { duration } = await measureTime(async () => {
        await convertModel(modelBuffer, {
          targetFormat: 'tflite',
          quantization: 'none',
          optimization: true,
        });
      });

      const passed = duration < targetDuration;

      benchmarkResults.push({
        model: 'yolov5n',
        format: 'tflite',
        quantization: 'none',
        duration,
        targetDuration,
        passed,
        inputSize: modelBuffer.byteLength,
      });

      expect(duration).toBeLessThan(targetDuration);
    }, 60000);

    it('应该能在 35 秒内完成带 FP16 量化的 TFLite 转换', async () => {
      const modelBuffer = createYOLOv5nMock();
      const targetDuration = 35000;

      const { duration } = await measureTime(async () => {
        await convertModel(modelBuffer, {
          targetFormat: 'tflite',
          quantization: 'fp16',
          optimization: true,
        });
      });

      benchmarkResults.push({
        model: 'yolov5n',
        format: 'tflite',
        quantization: 'fp16',
        duration,
        targetDuration,
        passed: duration < targetDuration,
        inputSize: modelBuffer.byteLength,
      });

      expect(duration).toBeLessThan(targetDuration);
    }, 60000);

    it('应该能在 40 秒内完成带 INT8 量化的 TFLite 转换', async () => {
      const modelBuffer = createYOLOv5nMock();
      const targetDuration = 40000;

      const { duration } = await measureTime(async () => {
        await convertModel(modelBuffer, {
          targetFormat: 'tflite',
          quantization: 'int8',
          optimization: true,
        });
      });

      benchmarkResults.push({
        model: 'yolov5n',
        format: 'tflite',
        quantization: 'int8',
        duration,
        targetDuration,
        passed: duration < targetDuration,
        inputSize: modelBuffer.byteLength,
      });

      expect(duration).toBeLessThan(targetDuration);
    }, 60000);
  });

  describe('YOLOv8n 转换性能', () => {
    it('应该能在 45 秒内完成 TFLite 转换', async () => {
      const modelBuffer = createYOLOv8nMock();
      const targetDuration = BENCHMARK_CONFIG.targets.yolov8n.tflite;

      const { duration } = await measureTime(async () => {
        await convertModel(modelBuffer, {
          targetFormat: 'tflite',
          quantization: 'none',
          optimization: true,
        });
      });

      benchmarkResults.push({
        model: 'yolov8n',
        format: 'tflite',
        quantization: 'none',
        duration,
        targetDuration,
        passed: duration < targetDuration,
        inputSize: modelBuffer.byteLength,
      });

      expect(duration).toBeLessThan(targetDuration);
    }, 60000);

    it('应该能在 50 秒内完成带 FP16 量化的 TFLite 转换', async () => {
      const modelBuffer = createYOLOv8nMock();
      const targetDuration = 50000;

      const { duration } = await measureTime(async () => {
        await convertModel(modelBuffer, {
          targetFormat: 'tflite',
          quantization: 'fp16',
          optimization: true,
        });
      });

      benchmarkResults.push({
        model: 'yolov8n',
        format: 'tflite',
        quantization: 'fp16',
        duration,
        targetDuration,
        passed: duration < targetDuration,
        inputSize: modelBuffer.byteLength,
      });

      expect(duration).toBeLessThan(targetDuration);
    }, 60000);
  });

  describe('ResNet50 转换性能', () => {
    it('应该能在 60 秒内完成 TFLite 转换', async () => {
      const modelBuffer = createResNet50Mock();
      const targetDuration = BENCHMARK_CONFIG.targets.resnet50.tflite;

      const { duration } = await measureTime(async () => {
        await convertModel(modelBuffer, {
          targetFormat: 'tflite',
          quantization: 'none',
          optimization: true,
        });
      });

      benchmarkResults.push({
        model: 'resnet50',
        format: 'tflite',
        quantization: 'none',
        duration,
        targetDuration,
        passed: duration < targetDuration,
        inputSize: modelBuffer.byteLength,
      });

      expect(duration).toBeLessThan(targetDuration);
    }, 120000);
  });

  describe('内存使用基准', () => {
    it('YOLOv5n 转换内存使用应低于 200MB', async () => {
      const modelBuffer = createYOLOv5nMock();
      const memoryLimit = BENCHMARK_CONFIG.memoryLimits.yolov5n;

      const memoryBefore = process.memoryUsage().heapUsed / 1024 / 1024;

      await convertModel(modelBuffer, {
        targetFormat: 'tflite',
        quantization: 'none',
        optimization: true,
      });

      const memoryAfter = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryUsed = memoryAfter - memoryBefore;

      const result = benchmarkResults.find(
        (r) => r.model === 'yolov5n' && r.format === 'tflite'
      );
      if (result) {
        result.memoryUsage = memoryUsed;
      }

      expect(memoryUsed).toBeLessThan(memoryLimit);
    }, 60000);

    it('YOLOv8n 转换内存使用应低于 300MB', async () => {
      const modelBuffer = createYOLOv8nMock();
      const memoryLimit = BENCHMARK_CONFIG.memoryLimits.yolov8n;

      const memoryBefore = process.memoryUsage().heapUsed / 1024 / 1024;

      await convertModel(modelBuffer, {
        targetFormat: 'tflite',
        quantization: 'none',
        optimization: true,
      });

      const memoryAfter = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryUsed = memoryAfter - memoryBefore;

      const result = benchmarkResults.find(
        (r) => r.model === 'yolov8n' && r.format === 'tflite'
      );
      if (result) {
        result.memoryUsage = memoryUsed;
      }

      expect(memoryUsed).toBeLessThan(memoryLimit);
    }, 60000);
  });

  describe('文件大小优化基准', () => {
    it('FP16 量化应减少至少 50% 的文件大小', async () => {
      const modelBuffer = createYOLOv5nMock();

      const result = await convertModel(modelBuffer, {
        targetFormat: 'tflite',
        quantization: 'fp16',
        optimization: true,
      });

      if (result.success && result.metadata) {
        const reduction =
          (1 - result.metadata.convertedSize / result.metadata.originalSize) * 100;

        const benchmarkResult = benchmarkResults.find(
          (r) => r.model === 'yolov5n' && r.quantization === 'fp16'
        );
        if (benchmarkResult) {
          benchmarkResult.sizeReduction = reduction;
          benchmarkResult.outputSize = result.metadata.convertedSize;
        }

        expect(reduction).toBeGreaterThanOrEqual(
          BENCHMARK_CONFIG.sizeReductionTargets.fp16
        );
      }
    }, 60000);

    it('INT8 量化应减少至少 75% 的文件大小', async () => {
      const modelBuffer = createYOLOv5nMock();

      const result = await convertModel(modelBuffer, {
        targetFormat: 'tflite',
        quantization: 'int8',
        optimization: true,
      });

      if (result.success && result.metadata) {
        const reduction =
          (1 - result.metadata.convertedSize / result.metadata.originalSize) * 100;

        const benchmarkResult = benchmarkResults.find(
          (r) => r.model === 'yolov5n' && r.quantization === 'int8'
        );
        if (benchmarkResult) {
          benchmarkResult.sizeReduction = reduction;
          benchmarkResult.outputSize = result.metadata.convertedSize;
        }

        expect(reduction).toBeGreaterThanOrEqual(
          BENCHMARK_CONFIG.sizeReductionTargets.int8
        );
      }
    }, 60000);
  });

  describe('并发性能', () => {
    it('应该能同时处理多个转换请求', async () => {
      const models = [
        { name: 'yolov5n', buffer: createYOLOv5nMock() },
        { name: 'yolov5n_2', buffer: createYOLOv5nMock() },
      ];

      const startTime = performance.now();

      const results = await Promise.all(
        models.map((m) =>
          convertModel(m.buffer, {
            targetFormat: 'tflite',
            quantization: 'none',
            optimization: true,
          })
        )
      );

      const totalDuration = performance.now() - startTime;

      // 所有转换应该成功
      expect(results.every((r) => r.success)).toBe(true);

      // 并发执行应该比串行快
      console.log(`并发转换完成时间: ${totalDuration.toFixed(2)}ms`);
    }, 120000);
  });
});

/**
 * 生成性能基准测试报告
 */
function generateBenchmarkReport() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 性能基准测试报告');
  console.log('='.repeat(70) + '\n');

  if (benchmarkResults.length === 0) {
    console.log('没有性能测试结果。\n');
    return;
  }

  // 按模型分组
  const grouped = benchmarkResults.reduce((acc, result) => {
    if (!acc[result.model]) {
      acc[result.model] = [];
    }
    acc[result.model].push(result);
    return acc;
  }, {} as Record<string, BenchmarkResult[]>);

  // 打印每个模型的结果
  Object.entries(grouped).forEach(([model, results]) => {
    console.log(`\n🔹 ${model.toUpperCase()}:`);
    console.log('-'.repeat(50));

    results.forEach((r) => {
      const status = r.passed ? '✅' : '❌';
      const durationStr = `${r.duration.toFixed(2)}ms`;
      const targetStr = `${r.targetDuration}ms`;
      const ratio = ((r.duration / r.targetDuration) * 100).toFixed(1);

      console.log(
        `  ${status} ${r.format} (${r.quantization}): ${durationStr} / ${targetStr} (${ratio}%)`
      );

      if (r.memoryUsage) {
        console.log(`     内存使用: ${r.memoryUsage.toFixed(2)} MB`);
      }

      if (r.sizeReduction !== undefined) {
        console.log(`     大小减少: ${r.sizeReduction.toFixed(1)}%`);
      }
    });
  });

  // 汇总
  const totalTests = benchmarkResults.length;
  const passedTests = benchmarkResults.filter((r) => r.passed).length;
  const failedTests = totalTests - passedTests;

  console.log('\n' + '='.repeat(70));
  console.log('📈 汇总:');
  console.log(`   总测试数: ${totalTests}`);
  console.log(`   通过: ${passedTests} ✅`);
  console.log(`   失败: ${failedTests} ❌`);

  if (failedTests > 0) {
    console.log('\n⚠️  未通过的测试:');
    benchmarkResults
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`   - ${r.model} ${r.format} (${r.quantization})`);
      });
  }

  console.log('='.repeat(70) + '\n');

  // 保存 JSON 报告
  if (typeof process !== 'undefined') {
    const fs = require('fs');
    const path = require('path');

    const reportPath = path.join(process.cwd(), 'test-results', 'benchmark.json');

    try {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(
        reportPath,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            results: benchmarkResults,
            summary: {
              total: totalTests,
              passed: passedTests,
              failed: failedTests,
            },
          },
          null,
          2
        )
      );
      console.log(`📄 详细报告已保存到: ${reportPath}\n`);
    } catch (e) {
      console.warn('无法保存性能报告:', e);
    }
  }
}
