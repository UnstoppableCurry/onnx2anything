import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  prepareNativeModelExport,
  runDockerExec,
  ensureCommandSuccess,
  quoteShell,
  copyContainerArtifactToHost,
} from './lib/native-toolchain-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const rawArgs = process.argv.slice(2);
const positionalArgs = rawArgs.filter((arg) => !arg.startsWith('--'));
const quantizationArg = rawArgs.find((arg) => arg.startsWith('--quantization='));
const quantization = quantizationArg?.split('=')[1] || 'none';
const overwriteInputShapeArgs = rawArgs.filter((arg) => arg.startsWith('--overwrite-input-shape='));

const [modelArg, outArg] = positionalArgs;

if (!modelArg || !outArg) {
  console.error(
    'Usage: node scripts/export-tflite-artifacts-native.mjs <modelPath> <outPath> [--quantization=none|fp16|int8|dynamic]'
  );
  process.exit(1);
}

const containerName = process.env.TFLITE_NATIVE_CONTAINER || 'onnx2anything-toolchain-builder';
const containerVenv = process.env.TFLITE_NATIVE_VENV || '/tmp/onnx2anything-tflite-venv';
const containerPython = `${containerVenv}/bin/python`;
const containerPip = `${containerVenv}/bin/pip`;
const containerHelperPath =
  process.env.TFLITE_NATIVE_HELPER || '/workspace/scripts/convert_onnx_to_tflite.py';
const notUseOnnxsim = process.env.TFLITE_NATIVE_NOT_USE_ONNXSIM !== '0';

if (!['none', 'fp16', 'int8', 'dynamic'].includes(quantization)) {
  console.error(`Unsupported quantization mode: ${quantization}`);
  process.exit(1);
}

const { outPath, modelSizeBytes, containerModelPath } = prepareNativeModelExport(
  projectRoot,
  modelArg,
  outArg
);
const containerOutputPath = `/tmp/onnx2anything-tflite-${process.pid}.tflite`;

const ensureVenvCommand =
  `if [ ! -x ${quoteShell(containerPython)} ]; then ` +
  `python3 -m venv ${quoteShell(containerVenv)}; ` +
  'fi && ' +
  `${quoteShell(containerPython)} - <<'PY'\n` +
  'import importlib.util\n' +
  "mods=['onnx','onnx2tf','tensorflow','tf_keras','onnx_graphsurgeon','sng4onnx','psutil','requests','flatbuffers','ai_edge_litert']\n" +
  "missing=[name for name in mods if importlib.util.find_spec(name) is None]\n" +
  'raise SystemExit(0 if not missing else 1)\n' +
  'PY';

const probeResult = runDockerExec({
  containerName,
  command: ensureVenvCommand,
});
if (probeResult.status !== 0) {
  const reducedInstallCommand =
    `${quoteShell(containerPip)} install --no-input --upgrade pip setuptools wheel && ` +
    `${quoteShell(containerPip)} install --no-input --prefer-binary ` +
    'tensorflow==2.19.0 tf-keras==2.19.0 onnx==1.19.1 onnx-graphsurgeon==0.5.8 ' +
    'ai-edge-litert==2.1.0 psutil==5.9.5 requests==2.32.5 flatbuffers==25.12.19 ' +
    'ml-dtypes==0.5.1 protobuf==4.25.5 numpy==1.26.4 sng4onnx==2.0.1 onnxruntime==1.23.0 && ' +
    `${quoteShell(containerPip)} install --no-input --no-deps onnx2tf==1.29.24`;
  ensureCommandSuccess(
    runDockerExec({
      containerName,
      command: reducedInstallCommand,
    }),
    'venv dependency install',
    'TFLite native export'
  );
}

const convertArgs = [
  quoteShell(containerPython),
  quoteShell(containerHelperPath),
  quoteShell(containerModelPath),
  quoteShell(containerOutputPath),
  `--quantization=${quoteShell(quantization)}`,
];

if (notUseOnnxsim) {
  convertArgs.push('--not-use-onnxsim');
}

for (const overwriteInputShapeArg of overwriteInputShapeArgs) {
  convertArgs.push(overwriteInputShapeArg);
}

const convertResult = runDockerExec({
  containerName,
  command: convertArgs.join(' '),
  encoding: 'utf8',
});

if (convertResult.stdout) {
  process.stdout.write(convertResult.stdout);
}
if (convertResult.status !== 0) {
  if (convertResult.stderr) {
    process.stderr.write(convertResult.stderr);
  }
  process.exit(convertResult.status ?? 1);
}

const tfliteBytes = copyContainerArtifactToHost({
  containerName,
  containerOutputPath,
  outPath,
});

console.log(
  JSON.stringify(
    {
      success: true,
      outPath,
      tfliteBytes,
      modelBytes: modelSizeBytes,
      quantization,
      notUseOnnxsim,
      containerName,
      containerVenv,
      containerHelperPath,
    },
    null,
    2
  )
);
