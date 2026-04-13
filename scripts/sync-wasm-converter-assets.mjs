import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const wasmConverterDist = path.join(projectRoot, 'packages/wasm-converter/dist');
const publicWasmConverterDir = path.join(projectRoot, 'apps/web/public/wasm-converter');

if (!fs.existsSync(wasmConverterDist)) {
  console.error(`wasm-converter dist directory not found: ${wasmConverterDist}`);
  process.exit(1);
}

fs.mkdirSync(publicWasmConverterDir, { recursive: true });
fs.cpSync(wasmConverterDist, publicWasmConverterDir, {
  force: true,
  recursive: true,
});

console.log(
  JSON.stringify(
    {
      success: true,
      source: wasmConverterDist,
      target: publicWasmConverterDir,
    },
    null,
    2
  )
);
