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

const [modelArg, outArg] = positionalArgs;

if (!modelArg || !outArg) {
  console.error(
    'Usage: node scripts/export-openvino-artifacts-native.mjs <modelPath> <outPath> [--quantization=none|fp16|int8]'
  );
  process.exit(1);
}

const containerName =
  process.env.OPENVINO_NATIVE_CONTAINER || 'onnx2anything-toolchain-builder';
const containerVenv = process.env.OPENVINO_NATIVE_VENV || '/tmp/openvino-native-venv';
const containerPython = `${containerVenv}/bin/python`;
const containerPip = `${containerVenv}/bin/pip`;
const containerHelperPath =
  process.env.OPENVINO_NATIVE_HELPER || '/workspace/scripts/convert_onnx_to_openvino.py';

if (!['none', 'fp16', 'int8'].includes(quantization)) {
  console.error(`Unsupported quantization mode: ${quantization}`);
  process.exit(1);
}

const { outPath, modelSizeBytes, containerModelPath } = prepareNativeModelExport(
  projectRoot,
  modelArg,
  outArg
);
const containerOutputPath = `/tmp/onnx2anything-openvino-${process.pid}.zip`;

const ensureVenvCommand =
  `if [ ! -x ${quoteShell(containerPython)} ]; then ` +
  `python3 -m venv ${quoteShell(containerVenv)}; ` +
  'fi && ' +
  `${quoteShell(containerPython)} - <<'PY'\n` +
  'import importlib.util\n' +
  "mods=['openvino','onnx','requests']\n" +
  "missing=[name for name in mods if importlib.util.find_spec(name) is None]\n" +
  'if missing:\n' +
  '    raise SystemExit(1)\n' +
  'import openvino as ov\n' +
  "raise SystemExit(0 if hasattr(ov, 'convert_model') and hasattr(ov, 'save_model') else 1)\n" +
  'PY';

const probeResult = runDockerExec({
  containerName,
  command: ensureVenvCommand,
});
if (probeResult.status !== 0) {
  const installCommand =
    `${quoteShell(containerPip)} install --no-input --upgrade pip setuptools wheel && ` +
    `${quoteShell(containerPip)} install --no-input --prefer-binary ` +
    'openvino==2026.1.0 onnx==1.21.0 requests==2.32.5';
  ensureCommandSuccess(
    runDockerExec({
      containerName,
      command: installCommand,
    }),
    'venv dependency install',
    'OpenVINO native export'
  );
}

const convertResult = runDockerExec({
  containerName,
  command:
    `${quoteShell(containerPython)} ${quoteShell(containerHelperPath)} ${quoteShell(
      containerModelPath
    )} ${quoteShell(containerOutputPath)} --quantization=${quoteShell(quantization)}`,
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

const openvinoZipBytes = copyContainerArtifactToHost({
  containerName,
  containerOutputPath,
  outPath,
});

console.log(
  JSON.stringify(
    {
      success: true,
      outPath,
      openvinoZipBytes,
      modelBytes: modelSizeBytes,
      quantization,
      containerName,
      containerVenv,
      containerHelperPath,
    },
    null,
    2
  )
);
