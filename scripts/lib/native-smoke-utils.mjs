import fs from 'node:fs';
import { spawn } from 'node:child_process';

export function runNodeScript({ projectRoot, scriptPath, args = [], failureLabel }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: projectRoot,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${failureLabel} failed with exit code ${code ?? 'null'}`));
    });
  });
}

export function assertNonEmptyFile(outPath, artifactLabel) {
  const stats = fs.statSync(outPath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`Expected a non-empty ${artifactLabel} at ${outPath}`);
  }
  return stats.size;
}

export async function runNativeExportSmoke({
  projectRoot,
  exportScriptPath,
  modelPath,
  outPath,
  failureLabel,
  artifactLabel,
  sizeField,
}) {
  await runNodeScript({
    projectRoot,
    scriptPath: exportScriptPath,
    args: [modelPath, outPath],
    failureLabel,
  });

  const artifactBytes = assertNonEmptyFile(outPath, artifactLabel);

  console.log(
    JSON.stringify(
      {
        success: true,
        modelPath,
        outPath,
        [sizeField]: artifactBytes,
      },
      null,
      2
    )
  );
}
