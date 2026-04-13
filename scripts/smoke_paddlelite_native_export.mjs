import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { runNativeExportSmoke } from './lib/native-smoke-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const exportScriptPath = path.join(projectRoot, 'scripts/export-paddlelite-artifacts-native.mjs');

const modelPath =
  process.argv[2] || 'apps/web/public/verify/generated/add_const.onnx';
const outPath =
  process.argv[3] || '/tmp/add_const.native.nb';

await runNativeExportSmoke({
  projectRoot,
  exportScriptPath,
  modelPath,
  outPath,
  failureLabel: 'Paddle Lite native smoke',
  artifactLabel: 'Paddle Lite file',
  sizeField: 'paddleLiteBytes',
});
