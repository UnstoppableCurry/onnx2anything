import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

export const MAX_MODEL_FILE_SIZE_BYTES = 1024 * 1024 * 1024;
export const DOCKER_COMMAND_MAX_BUFFER_BYTES = 256 * 1024 * 1024;
export const DOCKER_ARTIFACT_MAX_BUFFER_BYTES = MAX_MODEL_FILE_SIZE_BYTES + 64 * 1024 * 1024;

export function quoteShell(value) {
  return JSON.stringify(value);
}

export function runDockerExec({
  containerName,
  command,
  maxBuffer = DOCKER_COMMAND_MAX_BUFFER_BYTES,
  ...options
}) {
  return spawnSync('docker', ['exec', containerName, 'sh', '-lc', command], {
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer,
    ...options,
  });
}

export function emitProcessOutput(result) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

export function ensureCommandSuccess(result, context, failurePrefix) {
  if (result.status === 0) {
    return;
  }

  emitProcessOutput(result);
  console.error(`${failurePrefix} failed during: ${context}`);
  process.exit(result.status ?? 1);
}

export function resolveRepoReadablePath(projectRoot, inputArg, label) {
  const resolvedPath = path.resolve(projectRoot, inputArg);

  if (!resolvedPath.startsWith(projectRoot + path.sep) && resolvedPath !== projectRoot) {
    console.error(`${label} must stay inside the repo so the container can read it: ${resolvedPath}`);
    process.exit(1);
  }

  return resolvedPath;
}

export function ensureExistingFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    console.error(`${label} was not found: ${filePath}`);
    process.exit(1);
  }

  return fs.statSync(filePath);
}

export function ensureModelSizeWithinLimit(modelSizeBytes) {
  if (modelSizeBytes > MAX_MODEL_FILE_SIZE_BYTES) {
    console.error(
      `Model is too large for this workflow (${modelSizeBytes} bytes > ${MAX_MODEL_FILE_SIZE_BYTES} bytes)`
    );
    process.exit(1);
  }
}

export function ensureWritableOutputPath(projectRoot, outArg) {
  const outPath = path.resolve(projectRoot, outArg);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  return outPath;
}

export function toWorkspacePath(projectRoot, localPath, workspaceRoot = '/workspace') {
  const relativePath = path.relative(projectRoot, localPath).split(path.sep).join('/');
  return `${workspaceRoot}/${relativePath}`;
}

export function prepareNativeModelExport(projectRoot, modelArg, outArg) {
  const modelPath = resolveRepoReadablePath(projectRoot, modelArg, 'Model path');
  const modelStats = ensureExistingFile(modelPath, 'Input ONNX model');
  ensureModelSizeWithinLimit(modelStats.size);

  const outPath = ensureWritableOutputPath(projectRoot, outArg);
  const containerModelPath = toWorkspacePath(projectRoot, modelPath);

  return {
    modelPath,
    outPath,
    modelSizeBytes: modelStats.size,
    containerModelPath,
  };
}

export function copyContainerArtifactToHost({
  containerName,
  containerOutputPath,
  outPath,
  maxBuffer = DOCKER_ARTIFACT_MAX_BUFFER_BYTES,
}) {
  const readResult = runDockerExec({
    containerName,
    command: `cat ${quoteShell(containerOutputPath)}`,
    encoding: null,
    maxBuffer,
  });

  runDockerExec({
    containerName,
    command: `rm -f ${quoteShell(containerOutputPath)}`,
  });

  if (readResult.status !== 0 || !readResult.stdout) {
    if (readResult.stderr) {
      process.stderr.write(readResult.stderr);
    }
    process.exit(readResult.status ?? 1);
  }

  fs.writeFileSync(outPath, readResult.stdout);
  return readResult.stdout.byteLength;
}
