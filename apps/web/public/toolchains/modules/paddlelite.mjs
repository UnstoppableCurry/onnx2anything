function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeInputBytes(input) {
  if (typeof input === 'string') return base64ToBytes(input);
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new Error('PaddleLite converter expects base64 string or Uint8Array input');
}

let runtimePromise;

function removePath(fs, targetPath) {
  try {
    if (!fs.analyzePath(targetPath).exists) {
      return;
    }
  } catch {
    return;
  }

  try {
    fs.unlink(targetPath);
    return;
  } catch {
    // The target may be a directory; recurse and remove it below.
  }

  let entries = [];
  try {
    entries = fs.readdir(targetPath);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry === '.' || entry === '..') continue;
    removePath(fs, `${targetPath}/${entry}`);
  }

  try {
    fs.rmdir(targetPath);
  } catch {
    // Ignore stale directory cleanup failures.
  }
}

function findFirstNbArtifact(fs, rootPath) {
  const queue = [rootPath];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    try {
      if (!fs.analyzePath(current).exists) {
        continue;
      }
    } catch {
      continue;
    }

    if (current.endsWith('.nb')) {
      return current;
    }

    let entries = [];
    try {
      entries = fs.readdir(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry === '.' || entry === '..') continue;
      queue.push(`${current}/${entry}`);
    }
  }

  return null;
}

function getToolchainBaseOrigin() {
  if (typeof self !== 'undefined' && self.location?.origin) {
    return self.location.origin;
  }
  if (typeof globalThis !== 'undefined' && globalThis.location?.origin) {
    return globalThis.location.origin;
  }
  throw new Error('Unable to resolve browser origin for PaddleLite toolchain');
}

async function loadPatchedRuntimeModule() {
  const sourceUrl = new URL('/toolchains/paddlelite/paddle_lite_opt.js', getToolchainBaseOrigin());
  const sourceText = await fetch(sourceUrl).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load paddle_lite_opt.js: ${response.status}`);
    }
    return response.text();
  });

  let patched = sourceText;
  const wasmUrl = new URL('/toolchains/paddlelite/paddle_lite_opt.wasm', getToolchainBaseOrigin()).toString();

  if (patched.includes('var Module=typeof Module!="undefined"?Module:{};')) {
    patched = patched.replace(
      'var Module=typeof Module!="undefined"?Module:{};',
      `var __paddleLiteOptReadyResolve;var Module={noInitialRun:true,ready:new Promise((resolve)=>{__paddleLiteOptReadyResolve=resolve;}),locateFile:function(path){return path.endsWith('.wasm')?${JSON.stringify(wasmUrl)}:path;},onRuntimeInitialized(){Module.__paddleLiteFS=FS;Module.__paddleLiteCallMain=callMain;__paddleLiteOptReadyResolve(Module);}};`
    );
  } else {
    patched =
      `var __paddleLiteOptReadyResolve;var Module={noInitialRun:true,ready:new Promise((resolve)=>{__paddleLiteOptReadyResolve=resolve;}),locateFile:function(path){return path.endsWith('.wasm')?${JSON.stringify(wasmUrl)}:path;},onRuntimeInitialized(){Module.__paddleLiteFS=FS;Module.__paddleLiteCallMain=callMain;__paddleLiteOptReadyResolve(Module);}};\n` +
      patched;
  }

  if (!patched.includes('Module.__paddleLiteFS=FS;Module.__paddleLiteCallMain=callMain;')) {
    patched = patched.replace(
      'if(Module["onRuntimeInitialized"])Module["onRuntimeInitialized"]();',
      'Module.__paddleLiteFS=FS;Module.__paddleLiteCallMain=callMain;if(Module["onRuntimeInitialized"])Module["onRuntimeInitialized"]();'
    );
  }

  if (!patched.includes('export default Module;')) {
    patched += '\nexport default Module;\n';
  }

  const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(patched)}`;
  return await import(/* @vite-ignore */ dataUrl);
}

export async function loadPaddleLiteOptRuntime() {
  if (!runtimePromise) {
    runtimePromise = loadPatchedRuntimeModule().then((module) => {
      const runtime = module.default ?? module;
      if (!runtime || typeof runtime !== 'object') {
        throw new Error('Paddle Lite opt runtime did not initialize correctly');
      }
      if (runtime.ready && typeof runtime.ready.then === 'function') {
        return runtime.ready;
      }
      return runtime;
    });
  }

  return runtimePromise;
}

export async function smokePaddleLiteOptRuntime() {
  const runtime = await loadPaddleLiteOptRuntime();
  if (typeof runtime.__paddleLiteCallMain !== 'function') {
    throw new Error('Paddle Lite opt runtime did not expose callMain');
  }
  runtime.__paddleLiteCallMain(['--help']);
  return { success: true };
}

export function register(context) {
  context.register({
    id: 'paddlelite',
    async convert(input, optionsJson) {
      const inputBytes = normalizeInputBytes(input);
      const options = JSON.parse(optionsJson || '{}');
      const runtime = await loadPaddleLiteOptRuntime();
      const fs = runtime.__paddleLiteFS;
      const callMain = runtime.__paddleLiteCallMain;

      if (!fs || typeof fs.writeFile !== 'function' || typeof callMain !== 'function') {
        return JSON.stringify({
          success: false,
          error: 'Paddle Lite opt runtime did not expose the expected FS/callMain bridge.',
        });
      }

      const workspaceRoot = '/workspace';
      const inputPath = `${workspaceRoot}/input.onnx`;
      const paramPath = `${workspaceRoot}/ignored.params`;
      const outputBase = `${workspaceRoot}/model`;
      const outputPath = `${outputBase}.nb`;

      try {
        fs.mkdir(workspaceRoot);
      } catch {
        // Workspace already exists.
      }

      removePath(fs, inputPath);
      removePath(fs, paramPath);
      removePath(fs, outputPath);
      removePath(fs, outputBase);

      fs.writeFile(inputPath, inputBytes);
      fs.writeFile(paramPath, new Uint8Array());

      const args = [
        '--model_type=onnx',
        `--model_file=${inputPath}`,
        `--param_file=${paramPath}`,
        '--optimize_out_type=naive_buffer',
        `--optimize_out=${outputBase}`,
        `--valid_targets=${options.validTargets || options.valid_targets || 'arm'}`,
      ];

      if (options.recordTailoringInfo) {
        args.push('--record_tailoring_info');
      }
      if (options.quantModel || options.quantization === 'int8') {
        args.push('--quant_model');
      }
      if (typeof options.quantType === 'string' && options.quantType.trim()) {
        args.push(`--quant_type=${options.quantType}`);
      }
      if (options.enableFp16 || options.quantization === 'fp16') {
        args.push('--enable_fp16');
      }
      if (options.sparseModel) {
        args.push('--sparse_model');
      }
      if (typeof options.sparseThreshold === 'number') {
        args.push(`--sparse_threshold=${options.sparseThreshold}`);
      }

      try {
        callMain(args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!fs.analyzePath(outputPath).exists) {
          return JSON.stringify({
            success: false,
            error: message,
          });
        }
      }

      const artifactPath = fs.analyzePath(outputPath).exists
        ? outputPath
        : findFirstNbArtifact(fs, workspaceRoot);

      if (!artifactPath) {
        return JSON.stringify({
          success: false,
          error: 'Paddle Lite opt did not produce a .nb artifact.',
        });
      }

      const outputBytes = fs.readFile(artifactPath);

      return JSON.stringify({
        success: true,
        output_base64: bytesToBase64(outputBytes),
        output_filename: 'model.nb',
        output_mime: 'application/octet-stream',
      });
    },
  });
}
