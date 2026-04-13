/**
 * WASM Converter Build Script
 *
 * This script packages Python files into a format that can be loaded by Pyodide in the browser.
 * It creates:
 * 1. A JSON manifest of all Python modules
 * 2. Base64-encoded Python files for dynamic loading
 * 3. A TypeScript declaration file for the worker
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PYTHON_DIR = path.join(__dirname, 'python');
const DIST_DIR = path.join(__dirname, 'dist');

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Recursively find all Python files
function findPythonFiles(dir, baseDir = dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      files.push(...findPythonFiles(fullPath, baseDir));
    } else if (entry.name.endsWith('.py')) {
      files.push({
        fullPath,
        relativePath,
        moduleName: relativePath.replace(/\\/g, '/').replace(/\.py$/, '').replace(/\//g, '.'),
        packagePath: relativePath.replace(/\\/g, '/')
      });
    }
  }

  return files;
}

// Build the Python package bundle
function build() {
  console.log('🔨 Building WASM Converter...');

  const pythonFiles = findPythonFiles(PYTHON_DIR);
  console.log(`📦 Found ${pythonFiles.length} Python files`);

  // Create manifest with file contents
  const manifest = {
    version: '0.1.0',
    generated: new Date().toISOString(),
    modules: {}
  };

  for (const file of pythonFiles) {
    const content = fs.readFileSync(file.fullPath, 'utf-8');
    const base64Content = Buffer.from(content).toString('base64');

    manifest.modules[file.moduleName] = {
      path: file.packagePath,
      content: base64Content,
      size: content.length
    };

    console.log(`  ✓ ${file.packagePath} (${content.length} bytes)`);
  }

  // Write manifest
  const manifestPath = path.join(DIST_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n📝 Manifest written to: ${manifestPath}`);

  // Create a combined Python package file for easy loading
  const combinedContent = pythonFiles.map(file => {
    const content = fs.readFileSync(file.fullPath, 'utf-8');
    return `
# === File: ${file.packagePath} ===
__file_map__["${file.packagePath}"] = """${content.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"""
`;
  }).join('\n');

  const loaderContent = `
# Auto-generated Python package loader for Pyodide
# Generated: ${new Date().toISOString()}

__file_map__ = {}

${combinedContent}

def install_package():
    """Install all Python files to Pyodide virtual filesystem."""
    import os
    import sys

    base_path = '/lib/python3.11/site-packages/onnx2anything'
    os.makedirs(base_path, exist_ok=True)

    for path, content in __file_map__.items():
        full_path = os.path.join(base_path, path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w') as f:
            f.write(content)

    # Add to path
    if base_path not in sys.path:
        sys.path.insert(0, base_path)

    return base_path

# Auto-install on import
install_package()
`;

  const combinedPath = path.join(DIST_DIR, 'onnx2anything_package.py');
  fs.writeFileSync(combinedPath, loaderContent);
  console.log(`📦 Combined package written to: ${combinedPath}`);

  // Create TypeScript types for the worker
  const typesContent = `
// Auto-generated TypeScript types for WASM Converter
// Generated: ${new Date().toISOString()}

export interface PythonModule {
  path: string;
  content: string; // base64
  size: number;
}

export interface Manifest {
  version: string;
  generated: string;
  modules: Record<string, PythonModule>;
}

export interface ConversionOptions {
  targetFormat: 'tflite' | 'openvino' | 'ncnn' | 'mnn' | 'paddlelite';
  quantization?: 'none' | 'fp16' | 'int8' | 'dynamic';
  optimization?: 'none' | 'basic' | 'aggressive';
  dynamicShapes?: boolean;
  verbose?: boolean;
}

export interface ConversionResult {
  buffer: ArrayBuffer;
  format: string;
  metadata: {
    sourceFormat: string;
    targetFormat: string;
    sourceSize: number;
    targetSize: number;
    opsetVersion?: number;
    irVersion?: number;
  };
  warnings?: string[];
}

export type WorkerMessageType =
  | 'ready'
  | 'progress'
  | 'complete'
  | 'error'
  | 'cancelled';

export interface WorkerMessage {
  type: WorkerMessageType;
  stage?: string;
  percent?: number;
  message?: string;
  result?: ConversionResult;
  error?: string;
}
`;

  const typesPath = path.join(DIST_DIR, 'types.d.ts');
  fs.writeFileSync(typesPath, typesContent);
  console.log(`📘 TypeScript types written to: ${typesPath}`);

  console.log('\n✅ Build complete!');
}

build();
