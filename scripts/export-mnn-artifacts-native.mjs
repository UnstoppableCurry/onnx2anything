import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  prepareNativeModelExport,
  runDockerExec,
  copyContainerArtifactToHost,
  quoteShell,
} from './lib/native-toolchain-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const [, , modelArg, outArg] = process.argv;

if (!modelArg || !outArg) {
  console.error(
    'Usage: node scripts/export-mnn-artifacts-native.mjs <modelPath> <outPath>'
  );
  process.exit(1);
}

const containerName = process.env.MNN_NATIVE_CONTAINER || 'onnx2anything-toolchain-builder';
const containerConverter =
  process.env.MNN_NATIVE_CONVERTER || '/workspace/third_party/MNN/build-host-converter/MNNConvert';
const { outPath, modelSizeBytes, containerModelPath } = prepareNativeModelExport(
  projectRoot,
  modelArg,
  outArg
);
const containerOutputPath = `/tmp/onnx2anything-mnn-${process.pid}.mnn`;

const convertResult = runDockerExec({
  containerName,
  command:
    `${containerConverter} -f ONNX --modelFile ${quoteShell(
      containerModelPath
    )} --MNNModel ${quoteShell(containerOutputPath)} --bizCode ONNX2Anything`,
});

if (convertResult.status !== 0) {
  process.stderr.write(convertResult.stderr);
  process.exit(convertResult.status ?? 1);
}

process.stdout.write(convertResult.stdout);

const mnnBytes = copyContainerArtifactToHost({
  containerName,
  containerOutputPath,
  outPath,
});

console.log(
  JSON.stringify(
    {
      success: true,
      outPath,
      mnnBytes,
      modelBytes: modelSizeBytes,
      containerName,
      containerConverter,
    },
    null,
    2
  )
);
