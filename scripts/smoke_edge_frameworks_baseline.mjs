import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const pythonExec = process.env.PYTHON || 'python3';
const flags = new Set(process.argv.slice(2));
const useRealModel = flags.has('--real-model');
const modelPath = useRealModel
  ? 'apps/web/public/verify/generated/ppocrv3_dbnet_no_identity.onnx'
  : 'apps/web/public/verify/generated/add_const.onnx';
const tfliteOutPath = useRealModel
  ? '/tmp/ppocrv3_dbnet.edge-baseline.tflite'
  : '/tmp/add_const.edge-baseline.tflite';
const paddleLiteOutPath = useRealModel
  ? '/tmp/ppocrv3_dbnet.edge-baseline.nb'
  : '/tmp/add_const.edge-baseline.nb';
const openvinoOutPath = useRealModel
  ? '/tmp/ppocrv3_dbnet.edge-baseline.openvino.zip'
  : '/tmp/add_const.edge-baseline.openvino.zip';

const checks = [
  {
    id: 'wasm-sync',
    command: process.execPath,
    args: [path.join(projectRoot, 'scripts/check-wasm-converter-sync.mjs')],
  },
  {
    id: 'converter-capabilities',
    command: pythonExec,
    args: [path.join(projectRoot, 'scripts/smoke_converter_capabilities.py')],
  },
  {
    id: 'openvino-python',
    command: pythonExec,
    args: [path.join(projectRoot, 'scripts/smoke_openvino_python_converter.py'), modelPath],
  },
  {
    id: 'tflite-native',
    command: process.execPath,
    args: [
      path.join(projectRoot, 'scripts/smoke_tflite_native_export.mjs'),
      modelPath,
      tfliteOutPath,
    ],
  },
  {
    id: 'paddlelite-native',
    command: process.execPath,
    args: [
      path.join(projectRoot, 'scripts/smoke_paddlelite_native_export.mjs'),
      modelPath,
      paddleLiteOutPath,
    ],
  },
  {
    id: 'openvino-native',
    command: process.execPath,
    args: [
      path.join(projectRoot, 'scripts/smoke_openvino_native_export.mjs'),
      modelPath,
      openvinoOutPath,
    ],
  },
  {
    id: 'mnn-auto-fallback',
    command: process.execPath,
    args: [path.join(projectRoot, 'scripts/smoke_dbnet_mnn_auto_export.mjs')],
  },
  {
    id: 'edge-output-compare',
    command: process.execPath,
    args: [
      path.join(projectRoot, 'scripts/compare_edge_framework_outputs.mjs'),
      ...(useRealModel ? ['--real-model'] : []),
    ],
  },
];

function runCheck(check) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    console.log(`\n[baseline] ${check.id} -> ${check.command} ${check.args.join(' ')}`);

    const child = spawn(check.command, check.args, {
      cwd: projectRoot,
      stdio: 'inherit',
    });

    child.once('error', (error) => {
      resolve({
        id: check.id,
        success: false,
        durationMs: Date.now() - startedAt,
        error: error.message,
      });
    });

    child.once('exit', (code, signal) => {
      resolve({
        id: check.id,
        success: code === 0,
        durationMs: Date.now() - startedAt,
        exitCode: code,
        signal,
      });
    });
  });
}

const results = [];

for (const check of checks) {
  results.push(await runCheck(check));
}

const failures = results.filter((result) => !result.success);

console.log(
  JSON.stringify(
    {
      success: failures.length === 0,
      mode: useRealModel ? 'real-model' : 'quick',
      modelPath,
      checks: results,
      failedChecks: failures.map((result) => result.id),
    },
    null,
    2
  )
);

process.exit(failures.length === 0 ? 0 : 1);
