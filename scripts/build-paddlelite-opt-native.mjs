import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  quoteShell,
  runDockerExec,
  ensureCommandSuccess,
  emitProcessOutput,
} from './lib/native-toolchain-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const containerName =
  process.env.PADDLELITE_NATIVE_CONTAINER || 'onnx2anything-toolchain-builder';
const containerPaddleRoot =
  process.env.PADDLELITE_NATIVE_SOURCE_ROOT || '/workspace/third_party/Paddle-Lite';
const containerPatchPath =
  process.env.PADDLELITE_PROTOBUF_PATCH || '/workspace/patches/paddle-lite-protobuf-gcc12.patch';
const optBuildDirName = process.env.PADDLELITE_OPT_BUILD_DIR || 'build.opt.native-host';
const runtimeBuildDirName =
  process.env.PADDLELITE_RUNTIME_BUILD_DIR || 'build.runtime.native-host';
const buildThreads = process.env.PADDLELITE_OPT_BUILD_THREADS || '8';
const localPatchPath = path.join(projectRoot, 'patches', 'paddle-lite-protobuf-gcc12.patch');

if (!fs.existsSync(localPatchPath)) {
  console.error(`Missing patch file: ${localPatchPath}`);
  process.exit(1);
}

const archResult = runDockerExec({
  containerName,
  command: 'uname -m',
  encoding: 'utf8',
});
ensureCommandSuccess(archResult, 'arch detection', 'Paddle Lite native opt build');

const hostArch = archResult.stdout.trim();
const enableArm = /^(aarch64|arm64)$/i.test(hostArch) ? 'ON' : 'OFF';
const enableX86 = /^(x86_64|amd64)$/i.test(hostArch) ? 'ON' : 'OFF';

ensureCommandSuccess(
  runDockerExec({
    containerName,
    command: `cd ${quoteShell(containerPaddleRoot)} && git submodule update --init --recursive`,
    encoding: 'utf8',
  }),
  'submodule sync'
  ,
  'Paddle Lite native opt build'
);

const patchTarget =
  'third-party/protobuf-host/src/google/protobuf/compiler/java/java_file.cc';
ensureCommandSuccess(
  runDockerExec({
    containerName,
    command:
      `cd ${quoteShell(containerPaddleRoot)} && ` +
      `command -v patch >/dev/null 2>&1 && ` +
      `if ! grep -Fq ${quoteShell('const FieldDescriptor* f2) const')} ${quoteShell(patchTarget)}; then ` +
      `patch -p1 < ${quoteShell(containerPatchPath)}; ` +
      'fi'
    ,
    encoding: 'utf8',
  }),
  'protobuf GCC12 patch'
  ,
  'Paddle Lite native opt build'
);

function configureBuild(buildDirName, optimizeTool) {
  const configureCommand =
    `mkdir -p ${quoteShell(path.posix.join(containerPaddleRoot, buildDirName))} && ` +
    `cd ${quoteShell(path.posix.join(containerPaddleRoot, buildDirName))} && ` +
    `cmake .. ` +
    `-DLITE_ON_MODEL_OPTIMIZE_TOOL=${optimizeTool ? 'ON' : 'OFF'} ` +
    `-DWITH_TESTING=OFF ` +
    `-DLITE_BUILD_EXTRA=ON ` +
    `-DLITE_WITH_X86=${enableX86} ` +
    `-DLITE_WITH_ARM=${enableArm} ` +
    (enableArm === 'ON'
      ? `-DARM_TARGET_OS=armlinux -DARM_TARGET_ARCH_ABI=armv8 -DARM_TARGET_LANG=gcc `
      : '') +
    `-DWITH_MKL=OFF`;
  ensureCommandSuccess(
    runDockerExec({
      containerName,
      command: configureCommand,
      encoding: 'utf8',
    }),
    `cmake configure (${buildDirName})`,
    'Paddle Lite native build'
  );
}

function buildTarget(buildDirName, target, label) {
  const result = runDockerExec({
    containerName,
    command:
      `cd ${quoteShell(path.posix.join(containerPaddleRoot, buildDirName))} && ` +
      `make ${target} -j${buildThreads}`,
    encoding: null,
  });
  emitProcessOutput(result);

  if (result.status !== 0) {
    console.error(`Paddle Lite native build failed during: make ${target} (${label})`);
    process.exit(result.status ?? 1);
  }
}

function finalizeBundledArchive(buildDirName) {
  const bundledLibPath = path.posix.join(
    containerPaddleRoot,
    buildDirName,
    'libpaddle_api_full_bundled.a'
  );
  const bundledLibArScript = path.posix.join(
    containerPaddleRoot,
    buildDirName,
    'paddle_api_full_bundled.ar'
  );
  ensureCommandSuccess(
    runDockerExec({
      containerName,
      command:
        `if [ ! -f ${quoteShell(bundledLibPath)} ] && [ -f ${quoteShell(
          bundledLibArScript
        )} ]; then ` +
        `cd ${quoteShell(path.posix.join(containerPaddleRoot, buildDirName))} && ` +
        `${quoteShell(process.env.PADDLELITE_NATIVE_AR || 'ar')} -M < ${quoteShell(
          bundledLibArScript
        )}; fi`,
      encoding: 'utf8',
    }),
    `bundle archive finalize (${buildDirName})`,
    'Paddle Lite native build'
  );
}

configureBuild(optBuildDirName, true);
configureBuild(runtimeBuildDirName, false);

const optPath = path.posix.join(containerPaddleRoot, optBuildDirName, 'lite/api/opt');
const runtimeBundledLibPath = path.posix.join(
  containerPaddleRoot,
  runtimeBuildDirName,
  'libpaddle_api_full_bundled.a'
);

const optExistsResult = runDockerExec({
  containerName,
  command: `test -x ${quoteShell(optPath)}`,
});
if (optExistsResult.status !== 0) {
  buildTarget(optBuildDirName, 'opt', 'opt');
}

const runtimeLibExistsResult = runDockerExec({
  containerName,
  command: `test -f ${quoteShell(runtimeBundledLibPath)}`,
});
if (runtimeLibExistsResult.status !== 0) {
  buildTarget(runtimeBuildDirName, 'bundle_full_api', 'runtime');
}
finalizeBundledArchive(runtimeBuildDirName);

const verifyResult = runDockerExec({
  containerName,
  command:
    `test -x ${quoteShell(optPath)} && ` +
    `test -f ${quoteShell(runtimeBundledLibPath)} && ` +
    `printf %s ${quoteShell(optPath)}`,
  encoding: 'utf8',
});
ensureCommandSuccess(verifyResult, 'artifact verification', 'Paddle Lite native build');

console.log(
  JSON.stringify(
    {
      success: true,
      containerName,
      hostArch,
      enableArm,
      enableX86,
      optBuildDir: path.posix.join(containerPaddleRoot, optBuildDirName),
      runtimeBuildDir: path.posix.join(containerPaddleRoot, runtimeBuildDirName),
      optPath,
      runtimeBundledLibPath,
      patchPath: containerPatchPath,
    },
    null,
    2
  )
);
