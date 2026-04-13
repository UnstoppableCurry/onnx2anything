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

function resolvePaddleLiteOptBuildDir(projectRootPath) {
  const rawCandidates = [
    process.env.PADDLELITE_OPT_BUILD_DIR,
    process.env.PADDLELITE_NATIVE_BUILD_DIR,
    'third_party/Paddle-Lite/build.opt.native-host',
    'third_party/Paddle-Lite/build.opt.host',
  ].filter(Boolean);

  const candidates = rawCandidates.map((candidate) =>
    path.isAbsolute(candidate) ? candidate : path.join(projectRootPath, candidate)
  );
  const found = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, 'lite/api/opt'))
  );
  if (found) {
    return found;
  }

  console.error(
    `Paddle Lite opt build was not found. Run node scripts/build-paddlelite-opt-native.mjs first. Checked: ${candidates.join(', ')}`
  );
  process.exit(1);
}

const rawArgs = process.argv.slice(2);
const positionalArgs = rawArgs.filter((arg) => !arg.startsWith('--'));
const validTargetsArg = rawArgs.find((arg) => arg.startsWith('--valid-targets='));
const validTargets = validTargetsArg?.split('=')[1] || 'arm';

const [modelArg, outArg] = positionalArgs;

if (!modelArg || !outArg) {
  console.error(
    'Usage: node scripts/export-paddlelite-artifacts-native.mjs <modelPath> <outPath> [--valid-targets=arm]'
  );
  process.exit(1);
}

const containerName =
  process.env.PADDLELITE_NATIVE_CONTAINER || 'onnx2anything-toolchain-builder';
const containerVenv =
  process.env.PADDLELITE_NATIVE_VENV || '/tmp/paddlelite-p26-venv';
const containerPython = `${containerVenv}/bin/python`;
const containerPip = `${containerVenv}/bin/pip`;
const paddleLiteBuildDir = resolvePaddleLiteOptBuildDir(projectRoot);
const paddleLiteBuildDirRel = path
  .relative(projectRoot, paddleLiteBuildDir)
  .split(path.sep)
  .join('/');
const containerOpt =
  process.env.PADDLELITE_NATIVE_OPT ||
  `/workspace/${paddleLiteBuildDirRel}/lite/api/opt`;
const containerHelperPath =
  process.env.PADDLELITE_NATIVE_HELPER || '/workspace/scripts/convert_onnx_to_paddlelite.py';
const { outPath, modelSizeBytes, containerModelPath } = prepareNativeModelExport(
  projectRoot,
  modelArg,
  outArg
);
const containerOutputPath = `/tmp/onnx2anything-paddlelite-${process.pid}.nb`;

const ensureEnvCommand =
  `if [ ! -x ${quoteShell(containerPython)} ]; then ` +
  `python3 -m venv ${quoteShell(containerVenv)}; ` +
  'fi && ' +
  `[ -x ${quoteShell(containerOpt)} ] && ` +
  `${quoteShell(containerPython)} - <<'PY'\n` +
  'import importlib.util\n' +
  'import sys\n' +
  "mods=['x2paddle','paddle','onnx','onnx.mapping','requests','six','packaging']\n" +
  "missing=[name for name in mods if importlib.util.find_spec(name) is None]\n" +
  'if missing:\n' +
  '    raise SystemExit(1)\n' +
  'import paddle\n' +
  'import x2paddle\n' +
  "paddle_ok = paddle.__version__ == '2.6.2'\n" +
  "x2paddle_ok = getattr(x2paddle, '__version__', '') == '1.6.0'\n" +
  'raise SystemExit(0 if paddle_ok and x2paddle_ok else 1)\n' +
  'PY';

const probeResult = runDockerExec({
  containerName,
  command: ensureEnvCommand,
});
if (probeResult.status !== 0) {
  const installCommand =
    `${quoteShell(containerPip)} install --no-input --upgrade pip setuptools wheel && ` +
    `${quoteShell(containerPip)} install --no-input --prefer-binary ` +
    'paddlepaddle==2.6.2 x2paddle==1.6.0 onnx==1.14.1 six requests sympy packaging';
  ensureCommandSuccess(
    runDockerExec({
      containerName,
      command: installCommand,
    }),
    'venv dependency install',
    'Paddle Lite native export'
  );
}

const convertResult = runDockerExec({
  containerName,
  command:
    `${quoteShell(containerPython)} ${quoteShell(containerHelperPath)} ${quoteShell(
      containerModelPath
    )} ${quoteShell(containerOutputPath)} --opt=${quoteShell(
      containerOpt
    )} --valid-targets=${quoteShell(validTargets)}`,
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

const paddleLiteBytes = copyContainerArtifactToHost({
  containerName,
  containerOutputPath,
  outPath,
});

console.log(
  JSON.stringify(
    {
      success: true,
      outPath,
      paddleLiteBytes,
      modelBytes: modelSizeBytes,
      validTargets,
      containerName,
      containerVenv,
      paddleLiteBuildDir: paddleLiteBuildDirRel,
      containerOpt,
      containerHelperPath,
    },
    null,
    2
  )
);
