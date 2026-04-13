import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  quoteShell,
  runDockerExec,
  toWorkspacePath,
} from './lib/native-toolchain-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(projectRoot, 'apps/web/public');
const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter((arg) => arg.startsWith('--')));
const useRealModel = flags.has('--real-model');
const frameworksArg = rawArgs.find((arg) => arg.startsWith('--frameworks='));
const selectedFrameworks = (frameworksArg?.split('=')[1] || 'tflite,openvino,mnn,paddlelite')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const allFrameworks = ['tflite', 'openvino', 'mnn', 'paddlelite'];
for (const framework of selectedFrameworks) {
  if (!allFrameworks.includes(framework)) {
    console.error(`Unsupported framework: ${framework}`);
    process.exit(1);
  }
}

const mode = useRealModel ? 'real-model' : 'quick';
const workRoot = path.join(projectRoot, '.cache-src', 'edge-compare', mode);
fs.mkdirSync(workRoot, { recursive: true });

const containerName = process.env.EDGE_COMPARE_CONTAINER || 'onnx2anything-toolchain-builder';
const ortVenv = process.env.EDGE_COMPARE_ORT_VENV || '/tmp/edge-compare-ort-venv';
const ortPython = `${ortVenv}/bin/python`;
const inferHelperContainerPath = '/workspace/scripts/infer_edge_framework.py';
const nativeRunnerContainerRoot = '/workspace/.cache-src/native-runners';

const modelConfig = useRealModel
  ? {
      modelRelPath: 'apps/web/public/verify/generated/ppocrv3_dbnet_no_identity.onnx',
      modelUrlPath: '/verify/generated/ppocrv3_dbnet_no_identity.onnx',
      tolerances: { atol: 1e-4, rtol: 1e-4 },
      samples: [
        {
          name: 'dbnet_160',
          tensors: [makeDeterministicTensor([1, 3, 160, 160], 160160)],
        },
      ],
    }
  : {
      modelRelPath: 'apps/web/public/verify/generated/add_const.onnx',
      modelUrlPath: '/verify/generated/add_const.onnx',
      tolerances: { atol: 1e-6, rtol: 1e-6 },
      samples: [
        {
          name: 'sample_1',
          tensors: [
            {
              shape: [2, 3],
              data: [2.0, -1.0, 3.0, 0.5, -0.5, 1.5],
            },
          ],
        },
        {
          name: 'sample_2',
          tensors: [
            {
              shape: [2, 3],
              data: [0.0, 8.0, -3.0, 4.25, 2.5, -7.0],
            },
          ],
        },
        {
          name: 'sample_3',
          tensors: [
            {
              shape: [2, 3],
              data: [-2.0, 3.5, 1.25, 9.0, -4.0, 0.0],
            },
          ],
        },
      ],
    };

const modelPath = path.join(projectRoot, modelConfig.modelRelPath);
if (!fs.existsSync(modelPath)) {
  console.error(`Model file does not exist: ${modelPath}`);
  process.exit(1);
}

function resolvePaddleLiteRuntimeBuildDir() {
  const rawCandidates = [
    process.env.PADDLELITE_RUNTIME_BUILD_DIR,
    'third_party/Paddle-Lite/build.runtime.native-host',
    'third_party/Paddle-Lite/build.runtime.host',
  ].filter(Boolean);

  const candidates = rawCandidates.map((candidate) =>
    path.isAbsolute(candidate) ? candidate : path.join(projectRoot, candidate)
  );
  const found = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, 'libpaddle_api_full_bundled.a'))
  );
  if (found) {
    return found;
  }

  console.error(
    `Paddle Lite runtime build was not found. Run node scripts/build-paddlelite-opt-native.mjs first. Checked: ${candidates.join(', ')}`
  );
  process.exit(1);
}

const paddleLiteRuntimeBuildDir = resolvePaddleLiteRuntimeBuildDir();
const paddleLiteRuntimeBuildDirRel = path
  .relative(projectRoot, paddleLiteRuntimeBuildDir)
  .split(path.sep)
  .join('/');

const frameworkArtifacts = {
  tflite: {
    artifactPath: path.join(workRoot, useRealModel ? 'dbnet.tflite' : 'add_const.tflite'),
    exportArgs: [
      path.join(projectRoot, 'scripts/export-tflite-artifacts-native.mjs'),
      modelConfig.modelRelPath,
      path.relative(projectRoot, path.join(workRoot, useRealModel ? 'dbnet.tflite' : 'add_const.tflite')),
      ...(useRealModel ? ['--overwrite-input-shape=x:1,3,160,160'] : []),
    ],
    infer(args) {
      return runContainerInference({
        framework: 'tflite',
        pythonExec: process.env.TFLITE_NATIVE_PYTHON || '/tmp/onnx2anything-tflite-venv/bin/python',
        modelPath: frameworkArtifacts.tflite.artifactPath,
        ...args,
      });
    },
  },
  openvino: {
    artifactPath: path.join(
      workRoot,
      useRealModel ? 'dbnet.openvino.zip' : 'add_const.openvino.zip'
    ),
    exportArgs: [
      path.join(projectRoot, 'scripts/export-openvino-artifacts-native.mjs'),
      modelConfig.modelRelPath,
      path.relative(
        projectRoot,
        path.join(workRoot, useRealModel ? 'dbnet.openvino.zip' : 'add_const.openvino.zip')
      ),
    ],
    infer(args) {
      return runContainerInference({
        framework: 'openvino',
        pythonExec: process.env.OPENVINO_NATIVE_PYTHON || '/tmp/openvino-native-venv/bin/python',
        modelPath: frameworkArtifacts.openvino.artifactPath,
        ...args,
      });
    },
  },
  mnn: {
    artifactPath: path.join(workRoot, useRealModel ? 'dbnet.mnn' : 'add_const.mnn'),
    exportArgs: null,
    infer(args) {
      const runnerPath = ensureContainerNativeRunnerBuilt('mnn');
      runContainerNativeRunner({
        runnerPath,
        modelPath: frameworkArtifacts.mnn.artifactPath,
        inputDumpPath: args.inputDumpPath,
        outputDumpPath: args.outputDumpPath,
      });
    },
  },
  paddlelite: {
    artifactPath: path.join(workRoot, useRealModel ? 'dbnet.nb' : 'add_const.nb'),
    exportArgs: [
      path.join(projectRoot, 'scripts/export-paddlelite-artifacts-native.mjs'),
      modelConfig.modelRelPath,
      path.relative(projectRoot, path.join(workRoot, useRealModel ? 'dbnet.nb' : 'add_const.nb')),
    ],
    infer(args) {
      const runnerPath = ensureContainerNativeRunnerBuilt('paddlelite');
      runContainerNativeRunner({
        runnerPath,
        modelPath: frameworkArtifacts.paddlelite.artifactPath,
        inputDumpPath: args.inputDumpPath,
        outputDumpPath: args.outputDumpPath,
      });
    },
  },
};

function makeDeterministicTensor(shape, seed) {
  const count = shape.reduce((accumulator, dim) => accumulator * dim, 1);
  const data = new Array(count);
  let state = seed >>> 0;
  for (let index = 0; index < count; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const uniform = state / 0xffffffff;
    const centered = uniform * 2 - 1;
    data[index] = Math.fround(centered * 0.25 + Math.sin(index * 0.03125) * 0.05);
  }
  return { shape, data };
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeTensorDump(filePath, tensors) {
  ensureDirectory(filePath);
  const lines = [String(tensors.length)];
  for (const tensor of tensors) {
    lines.push([tensor.shape.length, ...tensor.shape].join(' '));
    lines.push(String(tensor.data.length));
    lines.push(tensor.data.map((value) => Number(value).toPrecision(9)).join(' '));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function readTensorDump(filePath) {
  const tokens = fs.readFileSync(filePath, 'utf8').trim().split(/\s+/).filter(Boolean);
  let cursor = 0;
  const next = () => {
    if (cursor >= tokens.length) {
      throw new Error(`Unexpected EOF while parsing tensor dump: ${filePath}`);
    }
    const token = tokens[cursor];
    cursor += 1;
    return token;
  };

  const tensorCount = Number(next());
  const tensors = [];
  for (let tensorIndex = 0; tensorIndex < tensorCount; tensorIndex += 1) {
    const dimsCount = Number(next());
    const shape = [];
    for (let dimIndex = 0; dimIndex < dimsCount; dimIndex += 1) {
      shape.push(Number(next()));
    }
    const valueCount = Number(next());
    const data = new Array(valueCount);
    for (let valueIndex = 0; valueIndex < valueCount; valueIndex += 1) {
      data[valueIndex] = Number(next());
    }
    tensors.push({ shape, data });
  }
  return tensors;
}

function normalizedShape(shape) {
  const collapsed = shape.filter((dim) => dim !== 1);
  return collapsed.length > 0 ? collapsed : [1];
}

function shapesMatch(a, b) {
  const normalizedA = normalizedShape(a);
  const normalizedB = normalizedShape(b);
  if (normalizedA.length !== normalizedB.length) {
    return false;
  }
  return normalizedA.every((value, index) => value === normalizedB[index]);
}

function compareTensorSets(reference, candidate, tolerances) {
  const outputPairs = [];
  let passed = reference.length === candidate.length;

  const pairCount = Math.min(reference.length, candidate.length);
  for (let index = 0; index < pairCount; index += 1) {
    const referenceTensor = reference[index];
    const candidateTensor = candidate[index];
    const elementCountMatches = referenceTensor.data.length === candidateTensor.data.length;
    const shapeMatches = shapesMatch(referenceTensor.shape, candidateTensor.shape);
    const comparable = elementCountMatches && shapeMatches;

    let maxAbsDiff = null;
    let meanAbsDiff = null;
    let allclose = false;

    if (comparable) {
      let maxDiff = 0;
      let diffSum = 0;
      allclose = true;
      for (let valueIndex = 0; valueIndex < referenceTensor.data.length; valueIndex += 1) {
        const referenceValue = referenceTensor.data[valueIndex];
        const candidateValue = candidateTensor.data[valueIndex];
        const absDiff = Math.abs(referenceValue - candidateValue);
        const tolerance =
          tolerances.atol + tolerances.rtol * Math.abs(referenceValue);
        if (absDiff > tolerance) {
          allclose = false;
        }
        if (absDiff > maxDiff) {
          maxDiff = absDiff;
        }
        diffSum += absDiff;
      }
      maxAbsDiff = maxDiff;
      meanAbsDiff = referenceTensor.data.length > 0 ? diffSum / referenceTensor.data.length : 0;
    }

    passed = passed && comparable && allclose;
    outputPairs.push({
      index,
      passed: comparable && allclose,
      referenceShape: referenceTensor.shape,
      candidateShape: candidateTensor.shape,
      elementCountMatches,
      shapeMatches,
      maxAbsDiff,
      meanAbsDiff,
    });
  }

  return {
    passed,
    outputCountMatches: reference.length === candidate.length,
    outputs: outputPairs,
  };
}

function execCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });

  if (result.status === 0) {
    return result;
  }

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'null'}`);
}

function runHostCommand(command, args) {
  execCapture(command, args);
}

function createStaticServer() {
  const contentTypes = {
    '.bin': 'application/octet-stream',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.onnx': 'application/octet-stream',
    '.param': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm',
  };

  function resolveRequestPath(requestUrl) {
    const url = new URL(requestUrl, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const relative = normalized.replace(/^[/\\]+/, '') || 'index.html';
    const absolute = path.join(publicRoot, relative);

    if (!absolute.startsWith(publicRoot + path.sep) && absolute !== publicRoot) {
      return null;
    }

    return absolute;
  }

  return http.createServer((req, res) => {
    const resolvedPath = resolveRequestPath(req.url || '/');
    if (!resolvedPath || !fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(resolvedPath)] || 'application/octet-stream',
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(resolvedPath).pipe(res);
  });
}

function ensureOrtPython() {
  const ensureCommand =
    `if [ ! -x ${quoteShell(ortPython)} ]; then python3 -m venv ${quoteShell(ortVenv)}; fi && ` +
    `${quoteShell(ortPython)} - <<'PY'\n` +
    'import importlib.util\n' +
    "mods=['numpy','onnxruntime']\n" +
    "missing=[name for name in mods if importlib.util.find_spec(name) is None]\n" +
    'raise SystemExit(0 if not missing else 1)\n' +
    'PY';

  const probe = runDockerExec({
    containerName,
    command: ensureCommand,
  });

  if (probe.status === 0) {
    return ortPython;
  }

  const install = runDockerExec({
    containerName,
    command:
      `${quoteShell(`${ortVenv}/bin/pip`)} install --no-input --upgrade pip setuptools wheel && ` +
      `${quoteShell(`${ortVenv}/bin/pip`)} install --no-input --prefer-binary ` +
      'numpy==1.26.4 onnxruntime==1.23.0',
    encoding: 'utf8',
  });

  if (install.status !== 0) {
    if (install.stdout) {
      process.stdout.write(install.stdout);
    }
    if (install.stderr) {
      process.stderr.write(install.stderr);
    }
    throw new Error('Failed to install ONNX Runtime compare environment inside container');
  }

  return ortPython;
}

function runContainerInference({ framework, pythonExec, modelPath: localModelPath, inputDumpPath, outputDumpPath }) {
  const containerModelPath = toWorkspacePath(projectRoot, localModelPath);
  const containerInputPath = toWorkspacePath(projectRoot, inputDumpPath);
  const containerOutputPath = toWorkspacePath(projectRoot, outputDumpPath);

  const result = runDockerExec({
    containerName,
    command:
      `${quoteShell(pythonExec)} ${quoteShell(inferHelperContainerPath)} ` +
      `--framework ${quoteShell(framework)} ${quoteShell(containerModelPath)} ` +
      `${quoteShell(containerInputPath)} ${quoteShell(containerOutputPath)}`,
    encoding: 'utf8',
  });

  if (result.status === 0) {
    return;
  }

  const combinedOutput = [result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n')
    .trim();
  const error = new Error(
    combinedOutput
      ? `Container inference failed for ${framework}\n${combinedOutput}`
      : `Container inference failed for ${framework}`
  );
  error.framework = framework;
  error.output = combinedOutput;
  throw error;
}

function classifyKnownBlocker(framework, error) {
  const detail = String(error?.output || error?.message || '');

  if (
    useRealModel &&
    framework === 'openvino' &&
    detail.includes('Supported Reduce executor is not found')
  ) {
    return {
      framework,
      reason:
        'OpenVINO real-model compare 在当前容器 ARM CPU plugin 上仍被 Reduce executor 缺口阻塞；导出成功，但本地推理一致性暂不能在此环境完成。',
      detail,
    };
  }

  return null;
}

function runContainerCommand(command, errorMessage) {
  const result = runDockerExec({
    containerName,
    command,
    encoding: 'utf8',
  });

  if (result.status === 0) {
    return;
  }

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  throw new Error(errorMessage);
}

function ensureContainerNativeRunnerBuilt(framework) {
  const buildRoot = path.join(projectRoot, '.cache-src', 'native-runners');
  fs.mkdirSync(buildRoot, { recursive: true });

  const configs = {
    mnn: {
      sourcePath: path.join(projectRoot, 'scripts/native-runners/mnn_infer.cpp'),
      outputPath: path.join(buildRoot, 'mnn_infer'),
      libraryPath: path.join(projectRoot, 'third_party/MNN/build-host-converter/libMNN.a'),
      includeDirs: [
        'third_party/MNN/include',
        'third_party/MNN/source',
        'third_party/MNN/express',
        'third_party/MNN/tools',
        'third_party/MNN/codegen',
        'third_party/MNN/schema/current',
        'third_party/MNN/3rd_party',
        'third_party/MNN/3rd_party/flatbuffers/include',
        'third_party/MNN/3rd_party/half',
        'third_party/MNN/3rd_party/imageHelper',
        'third_party/MNN/3rd_party/OpenCLHeaders',
        'scripts/native-runners',
      ],
      defines: [
        'MNN_BUILD_STATIC_LIBS',
        'MNN_SUPPORT_DEPRECATED_OPV2',
        'MNN_SUPPORT_QUANT_EXTEND',
        'MNN_USE_NEON',
        'MNN_USE_THREAD_POOL',
      ],
      extraLinkArgs: ['-lpthread'],
    },
    paddlelite: {
      sourcePath: path.join(projectRoot, 'scripts/native-runners/paddlelite_infer.cpp'),
      outputPath: path.join(buildRoot, 'paddlelite_infer'),
      libraryPath: path.join(paddleLiteRuntimeBuildDir, 'libpaddle_api_full_bundled.a'),
      includeDirs: [
        'third_party/Paddle-Lite',
        paddleLiteRuntimeBuildDirRel,
        'third_party/Paddle-Lite/third-party/flatbuffers/pre-build',
        `${paddleLiteRuntimeBuildDirRel}/third_party/install/gflags/include`,
        `${paddleLiteRuntimeBuildDirRel}/third_party/install/glog/include`,
        `${paddleLiteRuntimeBuildDirRel}/third_party/install/protobuf/include`,
        `${paddleLiteRuntimeBuildDirRel}/third_party/install/openblas/include`,
        `${paddleLiteRuntimeBuildDirRel}/third_party/eigen3/src/extern_eigen3`,
        'scripts/native-runners',
      ],
      defines: [
        'EIGEN_FAST_MATH=0',
        'LITE_BUILD_EXTRA',
        'LITE_WITH_FLATBUFFERS_DESC',
        'LITE_WITH_LOG',
        'PADDLE_DISABLE_PROFILER',
        'PADDLE_NO_PYTHON',
        'PADDLE_USE_DSO',
        'PADDLE_USE_OPENBLAS',
        'PADDLE_USE_PTHREAD_BARRIER',
        'PADDLE_USE_PTHREAD_SPINLOCK',
        'PADDLE_VERSION=0.0.0',
        'WITH_ARM_DOTPROD',
      ],
      extraCompileArgs: ['-fopenmp'],
      extraLinkArgs: ['-fopenmp', '-lpthread', '-lz'],
    },
  };

  const config = configs[framework];
  const headerPath = path.join(projectRoot, 'scripts/native-runners/tensor_dump.hpp');
  const outputExists = fs.existsSync(config.outputPath);
  const outputMtime = outputExists ? fs.statSync(config.outputPath).mtimeMs : 0;
  const sourceMtime = Math.max(
    fs.statSync(config.sourcePath).mtimeMs,
    fs.statSync(headerPath).mtimeMs,
    fs.statSync(config.libraryPath).mtimeMs
  );

  if (outputExists && outputMtime >= sourceMtime) {
    return `${nativeRunnerContainerRoot}/${path.basename(config.outputPath)}`;
  }

  const compiler = process.env.EDGE_COMPARE_CXX || 'c++';
  const containerSourcePath = toWorkspacePath(projectRoot, config.sourcePath);
  const containerOutputPath = `${nativeRunnerContainerRoot}/${path.basename(config.outputPath)}`;
  const args = ['-std=c++17', '-O2', ...(config.extraCompileArgs || []), quoteShell(containerSourcePath), '-o', quoteShell(containerOutputPath)];
  for (const define of config.defines) {
    args.push(`-D${define}`);
  }
  for (const includeDir of config.includeDirs) {
    args.push('-I', quoteShell(`/workspace/${includeDir}`));
  }
  args.push(
    '-Wl,--whole-archive',
    quoteShell(`/workspace/${path.relative(projectRoot, config.libraryPath)}`),
    '-Wl,--no-whole-archive',
    ...config.extraLinkArgs,
    '-ldl'
  );

  const compileCommand =
    `mkdir -p ${quoteShell(nativeRunnerContainerRoot)} && ` +
    `${quoteShell(compiler)} ${args.join(' ')}`;
  runContainerCommand(
    compileCommand,
    `Failed to compile container runner for ${framework}`
  );

  return containerOutputPath;
}

function runContainerNativeRunner({ runnerPath, modelPath: localModelPath, inputDumpPath, outputDumpPath }) {
  const containerModelPath = toWorkspacePath(projectRoot, localModelPath);
  const containerInputPath = toWorkspacePath(projectRoot, inputDumpPath);
  const containerOutputPath = toWorkspacePath(projectRoot, outputDumpPath);
  runContainerCommand(
    `${quoteShell(runnerPath)} ${quoteShell(containerModelPath)} ${quoteShell(
      containerInputPath
    )} ${quoteShell(containerOutputPath)}`,
    `Failed to execute container native runner: ${runnerPath}`
  );
}

function exportFrameworkArtifacts(staticBaseUrl) {
  for (const framework of selectedFrameworks) {
    if (framework === 'mnn') {
      runHostCommand(process.execPath, [
        path.join(projectRoot, 'scripts/export-mnn-artifacts.mjs'),
        staticBaseUrl,
        modelConfig.modelUrlPath,
        frameworkArtifacts.mnn.artifactPath,
        '--fallback-native',
      ]);
      continue;
    }

    runHostCommand(process.execPath, frameworkArtifacts[framework].exportArgs);
  }
}

async function main() {
  const server = createStaticServer();
  let baseUrl = null;

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve temporary static server address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    ensureOrtPython();
    exportFrameworkArtifacts(baseUrl);

    const referencePython = ortPython;
    const summary = {
      success: true,
      allFrameworksPassed: true,
      mode,
      modelPath: modelConfig.modelRelPath,
      tolerances: modelConfig.tolerances,
      knownBlockedFrameworks: [],
      frameworks: {},
    };

    for (const framework of selectedFrameworks) {
      const artifactPath = frameworkArtifacts[framework].artifactPath;
      const sampleSummaries = [];
      let frameworkPassed = true;
      let blocker = null;

      for (const sample of modelConfig.samples) {
        const sampleRoot = path.join(workRoot, framework, sample.name);
        fs.mkdirSync(sampleRoot, { recursive: true });

        const inputDumpPath = path.join(sampleRoot, 'input.dump');
        const referenceDumpPath = path.join(sampleRoot, 'onnx.dump');
        const candidateDumpPath = path.join(sampleRoot, `${framework}.dump`);

        writeTensorDump(inputDumpPath, sample.tensors);
        runContainerInference({
          framework: 'onnx',
          pythonExec: referencePython,
          modelPath,
          inputDumpPath,
          outputDumpPath: referenceDumpPath,
        });
        try {
          frameworkArtifacts[framework].infer({
            inputDumpPath,
            outputDumpPath: candidateDumpPath,
          });
        } catch (error) {
          blocker = classifyKnownBlocker(framework, error);
          if (blocker) {
            frameworkPassed = false;
            break;
          }
          throw error;
        }

        const referenceTensors = readTensorDump(referenceDumpPath);
        const candidateTensors = readTensorDump(candidateDumpPath);
        const comparison = compareTensorSets(
          referenceTensors,
          candidateTensors,
          modelConfig.tolerances
        );

        frameworkPassed = frameworkPassed && comparison.passed;
        sampleSummaries.push({
          sample: sample.name,
          passed: comparison.passed,
          comparison,
        });
      }

      const artifactBytes = fs.statSync(artifactPath).size;
      summary.frameworks[framework] = {
        artifactPath: path.relative(projectRoot, artifactPath),
        artifactBytes,
        passed: frameworkPassed,
        blocked: Boolean(blocker),
        blockedReason: blocker?.reason,
        samples: sampleSummaries,
      };
      if (blocker) {
        summary.knownBlockedFrameworks.push({
          framework,
          reason: blocker.reason,
        });
        summary.allFrameworksPassed = false;
        continue;
      }

      summary.success = summary.success && frameworkPassed;
      summary.allFrameworksPassed = summary.allFrameworksPassed && frameworkPassed;
    }

    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.success ? 0 : 1);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

await main();
