import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(projectRoot, 'apps/web/public/toolchains');
const paddleLiteBackHalfArtifacts = [
  'apps/web/public/toolchains/paddlelite/paddle_lite_opt.js',
  'apps/web/public/toolchains/paddlelite/paddle_lite_opt.wasm',
];
const paddleLiteWasmBackHalfReady = paddleLiteBackHalfArtifacts.every((artifact) =>
  exists(artifact)
);

function exists(relativePath) {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function makeEntry(config) {
  const ready = config.readyArtifacts.every((artifact) => exists(artifact));
  const availability = ready
    ? 'ready'
    : config.sourceArtifacts.some((artifact) => exists(artifact))
      ? 'build-required'
      : 'unavailable';
  const runtimeStatus = ready
    ? 'available'
    : availability === 'build-required'
      ? 'requires-toolchain'
      : 'unavailable';

  const notes = [...config.notes];
  if (ready && config.readyNote) {
    notes.unshift(config.readyNote);
  } else if (!ready && config.missingNote) {
    notes.push(config.missingNote);
  }

  return {
    id: config.id,
    label: config.label,
    description: config.description,
    runtime: 'wasm-module',
    availability,
    status: ready ? config.readyStatus : config.pendingStatus,
    moduleUrl: config.moduleUrl,
    register: config.register,
    readinessProbeUrl: config.readinessProbeUrl,
    outputExtension: config.outputExtension,
    outputFilename: config.outputFilename,
    outputMime: config.outputMime,
    notes,
    runtimeAvailable: ready,
    runtimeStatus,
    runtimeReason: ready ? undefined : config.missingNote,
    verification: config.verification,
  };
}

ensureDir(publicRoot);

const manifest = {
  version: '0.2.0',
  generatedAt: new Date().toISOString(),
  toolchains: [
    makeEntry({
      id: 'ncnn',
      label: 'NCNN',
      description: '腾讯开源移动端推理框架，适合 Android / iOS / ARM Linux。',
      moduleUrl: '/toolchains/modules/ncnn.mjs',
      register: 'register',
      outputExtension: 'ncnn.zip',
      outputFilename: 'model.ncnn.zip',
      outputMime: 'application/zip',
      readyArtifacts: [
        'apps/web/public/toolchains/modules/ncnn.mjs',
        'apps/web/public/toolchains/ncnn/onnx2ncnn.js',
        'apps/web/public/toolchains/ncnn/onnx2ncnn.wasm',
      ],
      sourceArtifacts: [
        'third_party/ncnn/tools/onnx/onnx2ncnn.cpp',
        'third_party/ncnn/build-wasm/tools/ncnnoptimize.js',
      ],
      readyStatus: 'beta',
      pendingStatus: 'experimental',
      notes: [
        '仓库内已存在 ncnn 源码和 build-wasm 工具链，当前主线定位为 CPU-only 浏览器导出，不包含 TensorRT / GPU 绑定后端。',
      ],
      verification: {
        quickComparePassed: true,
        realModelComparePassed: true,
        browserRuntimeReady: true,
        comparedWith: 'ONNX',
        note: 'NCNN 已通过 quick baseline 与 DBNet compare 验证。',
      },
      readyNote:
        '检测到完整的 onnx2ncnn 浏览器侧构建产物，当前可直接在 worker 中加载并执行 ONNX -> NCNN 转换。',
      missingNote:
        '运行 `npm run build:toolchains` 生成 onnx2ncnn 包装模块和 manifest；若 onnx2ncnn 仍缺失，需要先在 wasm-builder 中补齐 protobuf/emscripten 交叉编译链路。',
    }),
    makeEntry({
      id: 'mnn',
      label: 'MNN',
      description: '阿里巴巴轻量推理框架，适合移动端与桌面端部署。',
      moduleUrl: '/toolchains/modules/mnn.mjs',
      register: 'register',
      readinessProbeUrl: '/toolchains/mnn/.browser-ready',
      outputExtension: 'mnn',
      outputFilename: 'model.mnn',
      outputMime: 'application/octet-stream',
      readyArtifacts: [
        'apps/web/public/toolchains/modules/mnn.mjs',
        'apps/web/public/toolchains/mnn/MNNConvert.js',
        'apps/web/public/toolchains/mnn/MNNConvert.wasm',
        'apps/web/public/toolchains/mnn/.browser-ready',
      ],
      sourceArtifacts: [
        'third_party/MNN/tools/converter/source/MNNConverter.cpp',
      ],
      readyStatus: 'beta',
      pendingStatus: 'experimental',
      notes: [
        '仓库内已 vendored MNNConverter 源码，并已产出浏览器侧 `MNNConvert.js/.wasm` 构建物；当前主线定位为 CPU-only 导出，不包含 GPU/TensorRT 绑定后端。',
        '当前浏览器链已验证可稳定覆盖 `add_const.onnx` 与 `ppocrv3_dbnet_no_identity.onnx`，并把保守前置分流阈值放宽到约 4MB。',
        '若真实模型在浏览器内触发 OOM，可直接使用 `npm run export:mnn:auto -- <baseUrl> <modelPath> <outPath>` 自动切到容器内 native MNNConvert。',
        '当前 ONNX 对齐验证已覆盖 browser-export + native-infer 路径，`add_const.onnx` 与 `ppocrv3_dbnet_no_identity.onnx` 输出均与 ONNX 对齐。',
      ],
      verification: {
        quickComparePassed: true,
        realModelComparePassed: true,
        browserRuntimeReady: true,
        comparedWith: 'ONNX',
        note: 'MNN 浏览器链已通过 add_const 与 DBNet(real-model) 验证；更大模型仍保留 native fallback。',
      },
      missingNote:
        'MNN browser-ready 依赖 `MNNConvert.js/.wasm`、包装模块与 `.browser-ready` 标记同时存在；若缺任一项，请重新执行构建与浏览器 smoke。',
    }),
    makeEntry({
      id: 'tnn',
      label: 'TNN',
      description: '腾讯开源跨平台推理框架，适合 Android / iOS / ARM Linux / macOS。',
      moduleUrl: '/toolchains/modules/tnn.mjs',
      register: 'register',
      readinessProbeUrl: '/toolchains/tnn/.browser-ready',
      outputExtension: 'tnn.zip',
      outputFilename: 'model.tnn.zip',
      outputMime: 'application/zip',
      readyArtifacts: [
        'apps/web/public/toolchains/modules/tnn.mjs',
        'apps/web/public/toolchains/tnn/TnnConverter.js',
        'apps/web/public/toolchains/tnn/TnnConverter.wasm',
        'apps/web/public/toolchains/tnn/.browser-ready',
      ],
      sourceArtifacts: [
        'third_party/TNN/tools/convert2tnn/',
      ],
      readyStatus: 'experimental',
      pendingStatus: 'experimental',
      notes: [
        'TNN (Tencent Neural Network) 是腾讯开源的跨平台推理框架，支持 ONNX 导入，输出 `.tnnproto + .tnnmodel` 双文件结构。',
        'WASM 工具链已构建完成（TnnConverter.js + TnnConverter.wasm），可在浏览器中直接运行 ONNX → TNN 转换。',
        '当前能力矩阵定位为 CPU-only 浏览器导出，不包含 GPU 绑定后端。',
      ],
      verification: {
        quickComparePassed: false,
        realModelComparePassed: false,
        browserRuntimeReady: true,
        comparedWith: null,
        note: 'WASM 工具链已构建，待端到端转换验证。',
      },
      readyNote: '检测到完整的 TnnConverter 浏览器侧构建产物，当前可直接在 worker 中加载并执行 ONNX → TNN 转换。',
      missingNote: '浏览器侧缺 TnnConverter.js/.wasm；运行 `npm run build:toolchain:tnn` 构建 WASM 工具链。',
    }),
    makeEntry({
      id: 'tengine',
      label: 'Tengine',
      description: 'OAID 开源 ARM 端侧推理框架，适合 IoT 和嵌入式设备，输出单一 .tmfile 格式。',
      moduleUrl: '/toolchains/modules/tengine.mjs',
      register: 'register',
      readinessProbeUrl: '/toolchains/tengine/.browser-ready',
      outputExtension: 'tmfile',
      outputFilename: 'model.tmfile',
      outputMime: 'application/octet-stream',
      readyArtifacts: [
        'apps/web/public/toolchains/modules/tengine.mjs',
        'apps/web/public/toolchains/tengine/TengineConvert.js',
        'apps/web/public/toolchains/tengine/TengineConvert.wasm',
        'apps/web/public/toolchains/tengine/.browser-ready',
      ],
      sourceArtifacts: [
        'third_party/Tengine/tools/convert_tool/',
      ],
      readyStatus: 'experimental',
      pendingStatus: 'experimental',
      notes: [
        'Tengine (OAID) 是开源的轻量级端侧推理框架，专为 ARM Cortex-A 和嵌入式 AI 芯片优化，输出单一 .tmfile 格式。',
        'WASM 工具链已构建完成（TengineConvert.js + TengineConvert.wasm），可在浏览器中直接运行 ONNX → Tengine 转换。',
        '当前能力矩阵定位为 CPU-only 浏览器导出，不包含 GPU 绑定后端。',
      ],
      verification: {
        quickComparePassed: false,
        realModelComparePassed: false,
        browserRuntimeReady: true,
        comparedWith: null,
        note: 'WASM 工具链已构建，待端到端转换验证。',
      },
      readyNote: '检测到完整的 TengineConverter 浏览器侧构建产物，当前可直接在 worker 中加载并执行 ONNX → Tengine 转换。',
      missingNote: '浏览器侧缺 TengineConvert.js/.wasm；运行 `npm run build:toolchain:tengine` 构建 WASM 工具链。',
    }),
    makeEntry({
      id: 'openvino',
      label: 'OpenVINO',
      description: 'Intel OpenVINO IR 转换链路，适合 CPU / GPU / NPU 部署。',
      moduleUrl: '/toolchains/modules/openvino.mjs',
      register: 'register',
      outputExtension: 'openvino.zip',
      outputFilename: 'model.openvino.zip',
      outputMime: 'application/zip',
      readyArtifacts: [
        'apps/web/public/toolchains/modules/openvino.mjs',
        'apps/web/public/toolchains/openvino/ovc.js',
        'apps/web/public/toolchains/openvino/ovc.wasm',
      ],
      sourceArtifacts: [
        'third_party/openvino/tools/ovc/openvino/tools/ovc',
      ],
      readyStatus: 'experimental',
      pendingStatus: 'experimental',
      notes: [
        '仓库内已包含 OpenVINO OVC 源码，但当前主线仅固化 CPU-only / native fallback 方案，不提供浏览器内 GPU 绑定导出。',
        '容器内 native fallback 已验证可用，可通过 `node scripts/export-openvino-artifacts-native.mjs <modelPath> <outPath>` 直接导出 `.xml + .bin` 的 zip 包。',
        '当前 compare runner 在 ARM CPU plugin 上会显式使用 `INFERENCE_PRECISION_HINT=f32`，用于绕过 DBNet 上已复现的 Reduce executor 缺口。',
        '日常回归优先跑 `npm run test:smoke:edge:baseline`，不要再把 OpenVINO 误记成“整体没进展”。',
      ],
      verification: {
        quickComparePassed: true,
        realModelComparePassed: true,
        browserRuntimeReady: false,
        comparedWith: 'ONNX',
        note: 'OpenVINO quick baseline 与 DBNet real-model compare 已通过；当前 native runner 需在 ARM CPU plugin 上显式使用 `INFERENCE_PRECISION_HINT=f32`。',
      },
      missingNote:
        '浏览器侧仍缺 `ovc.js/ovc.wasm`；现阶段应走 native/container fallback，不要重复尝试旧的 browser-only scaffold。',
    }),
    makeEntry({
      id: 'paddlelite',
      label: 'Paddle Lite',
      description: '飞桨端侧推理格式，面向 ARM / Android / iOS 等设备。',
      moduleUrl: '/toolchains/modules/paddlelite.mjs',
      register: 'register',
      readinessProbeUrl: '/toolchains/paddlelite/.browser-ready',
      outputExtension: 'paddlelite.zip',
      outputFilename: 'model.paddlelite.zip',
      outputMime: 'application/zip',
      readyArtifacts: [
        'apps/web/public/toolchains/modules/paddlelite.mjs',
        'apps/web/public/toolchains/paddlelite/paddle_lite_opt.js',
        'apps/web/public/toolchains/paddlelite/paddle_lite_opt.wasm',
        'apps/web/public/toolchains/paddlelite/.browser-ready',
      ],
      sourceArtifacts: [
        'third_party/Paddle-Lite/lite/api/tools/opt.cc',
      ],
      readyStatus: 'experimental',
      pendingStatus: 'experimental',
      notes: [
        paddleLiteWasmBackHalfReady
          ? '已检测到 Paddle Lite wasm 后半段构建物 `paddle_lite_opt.js/.wasm`，且低层 runtime smoke 已通过；但它只覆盖 Paddle inference model -> .nb，不代表完整 ONNX 浏览器链路已就绪。'
          : '仓库内已包含 Paddle Lite opt 源码；浏览器侧后半段需要的 `paddle_lite_opt.js/.wasm` 仍在补齐。',
        '当前主线仅固化 CPU-only / native fallback 方案，明确不包含 TensorRT 或其他 GPU 绑定后端。',
        '容器内 native export 与 compare 已验证可用，可通过 `node scripts/export-paddlelite-artifacts-native.mjs <modelPath> <outPath>` 直接导出 `.nb` 文件。',
        '当前 `add_const.onnx` 与 `ppocrv3_dbnet_no_identity.onnx` 的 Paddle Lite 输出已和 ONNX 对齐。',
        '不要再把 Paddle Lite 浏览器阻塞误记成“只是没出 opt.wasm”：前半段 ONNX -> Paddle 仍依赖 x2paddle + paddle Python 运行时，而且 x2paddle 在导入阶段就会拉起 paddle。',
      ],
      verification: {
        quickComparePassed: true,
        realModelComparePassed: true,
        browserRuntimeReady: false,
        comparedWith: 'ONNX',
        note: 'Paddle Lite 一致性 compare 已通过；但浏览器侧完整 ONNX -> PaddleLite 仍分成前半段 x2paddle/paddle 依赖与后半段 opt.wasm 两个问题。',
      },
      missingNote: paddleLiteWasmBackHalfReady
        ? '已检测到 `paddle_lite_opt.js/.wasm`，但完整浏览器链路仍未打通：前半段 ONNX -> Paddle 仍依赖 x2paddle + paddle，且尚未创建 `.browser-ready` 标记。现阶段继续走 native/container export。'
        : '浏览器侧完整链路仍未打通：后半段 `paddle_lite_opt.js/.wasm` 待补齐，前半段 ONNX -> Paddle 仍依赖 x2paddle + paddle。现阶段继续走 native/container export。',
    }),
  ],
};

fs.writeFileSync(
  path.join(publicRoot, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);

console.log(`Wrote toolchain manifest to ${path.join(publicRoot, 'manifest.json')}`);
