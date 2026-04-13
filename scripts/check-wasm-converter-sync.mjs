import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const pairs = [
  ['packages/wasm-converter/dist/manifest.json', 'apps/web/public/wasm-converter/manifest.json'],
  ['packages/wasm-converter/dist/onnx2anything_package.py', 'apps/web/public/wasm-converter/onnx2anything_package.py'],
  ['packages/wasm-converter/dist/types.d.ts', 'apps/web/public/wasm-converter/types.d.ts'],
];

const mismatches = [];

for (const [sourceRel, targetRel] of pairs) {
  const sourcePath = path.join(projectRoot, sourceRel);
  const targetPath = path.join(projectRoot, targetRel);

  if (!fs.existsSync(sourcePath)) {
    mismatches.push({ source: sourceRel, target: targetRel, reason: 'source-missing' });
    continue;
  }
  if (!fs.existsSync(targetPath)) {
    mismatches.push({ source: sourceRel, target: targetRel, reason: 'target-missing' });
    continue;
  }

  const source = fs.readFileSync(sourcePath);
  const target = fs.readFileSync(targetPath);
  if (!source.equals(target)) {
    mismatches.push({ source: sourceRel, target: targetRel, reason: 'content-diff' });
  }
}

if (mismatches.length > 0) {
  console.error(
    JSON.stringify(
      {
        success: false,
        mismatches,
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      success: true,
      checked: pairs.length,
    },
    null,
    2
  )
);
