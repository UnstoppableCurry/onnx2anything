function bytesToBase64(input) {
  let binary = '';
  for (let index = 0; index < input.length; index += 1) {
    binary += String.fromCharCode(input[index]);
  }
  return btoa(binary);
}

function base64ToBytes(input) {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

let moduleFactoryPromise;

function getToolchainBaseOrigin() {
  if (typeof self !== 'undefined' && self.location?.origin) {
    return self.location.origin;
  }
  if (typeof globalThis !== 'undefined' && globalThis.location?.origin) {
    return globalThis.location.origin;
  }
  throw new Error('Unable to resolve browser origin for TNN toolchain');
}

async function loadTnnConverterFactory() {
  const sourceUrl = new URL('/toolchains/tnn/TnnConverter.js', getToolchainBaseOrigin());
  const sourceText = await fetch(sourceUrl).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load TnnConverter.js: ${response.status}`);
    }
    return response.text();
  });

  let patchedSource = sourceText
    .replace(
      'var _scriptDir = import.meta.url;',
      `var _scriptDir = ${JSON.stringify(sourceUrl.toString())};`
    )
    .replace(
      /const __dirname = new URL\('\.', import\.meta\.url\)\.pathname\.replace\(\/\\\/\$\/, ''\);/,
      `const __dirname = ${JSON.stringify(decodeURIComponent(sourceUrl.pathname.replace(/\/[^/]*$/, '')))};`
    );

  const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(patchedSource)}`;
  const module = await import(/* @vite-ignore */ dataUrl);
  const factory = module.default ?? module;

  if (typeof factory !== 'function') {
    throw new Error('TnnConverter runtime did not expose a callable module factory');
  }

  return factory;
}

function normalizeInputBytes(input) {
  if (typeof input === 'string') {
    return base64ToBytes(input);
  }

  if (input instanceof Uint8Array) {
    return input;
  }

  throw new Error('TNN converter expects a base64 string or Uint8Array input');
}

function resolveWasmLocation() {
  const wasmUrl = new URL('/toolchains/tnn/TnnConverter.wasm', getToolchainBaseOrigin());
  if (wasmUrl.protocol === 'file:') {
    return decodeURIComponent(wasmUrl.pathname);
  }
  return wasmUrl.toString();
}

function resolveTnnAsset(path) {
  return new URL(`/toolchains/tnn/${path}`, getToolchainBaseOrigin()).toString();
}

async function getModuleFactory() {
  if (!moduleFactoryPromise) {
    moduleFactoryPromise = loadTnnConverterFactory().catch((err) => {
      moduleFactoryPromise = undefined; // allow retry on transient failures
      throw err;
    });
  }
  return moduleFactoryPromise;
}

async function createModule() {
  const createTnnConverterModule = await getModuleFactory();
  const stderrLines = [];
  return createTnnConverterModule({
    noInitialRun: true,
    print: () => {},
    printErr: (...messages) => {
      stderrLines.push(messages.join(' '));
      console.warn('[TnnConverter]', ...messages);
    },
    locateFile(path) {
      if (path.endsWith('.wasm')) {
        return resolveWasmLocation();
      }
      return resolveTnnAsset(path);
    },
    _stderrLines: stderrLines,
  });
}

export function register(context) {
  context.register({
    id: 'tnn',
    async convert(input, optionsJson) {
      try {
        const options = JSON.parse(optionsJson || '{}');
        const module = await createModule();
        const inputPath = '/workspace/model.onnx';
        const protoPath = '/workspace/model.tnnproto';
        const modelPath = '/workspace/model.tnnmodel';
        const inputBytes = normalizeInputBytes(input);

        try {
          module.FS.mkdir('/workspace');
        } catch {}

        try { module.FS.unlink(inputPath); } catch {}
        try { module.FS.unlink(protoPath); } catch {}
        try { module.FS.unlink(modelPath); } catch {}

        module.FS.writeFile(inputPath, inputBytes);

        // TnnConverter -mt ONNX -mp <input> -od <output_dir>
        const args = ['-mt', 'ONNX', '-mp', inputPath, '-od', '/workspace/'];

        if (options.quantization === 'fp16') {
          args.push('-half');
        }

        module.callMain(args);

        if (!module.FS.analyzePath(protoPath).exists || !module.FS.analyzePath(modelPath).exists) {
          const stderr = (module._stderrLines || []).join('\n') || '(no output)';
          return JSON.stringify({
            success: false,
            error: `convert2tnn produced no output files. Stderr: ${stderr}`,
          });
        }

        const protoBytes = module.FS.readFile(protoPath);
        const modelBytes = module.FS.readFile(modelPath);

        try { module.FS.unlink(inputPath); } catch {}
        try { module.FS.unlink(protoPath); } catch {}
        try { module.FS.unlink(modelPath); } catch {}

        return JSON.stringify({
          success: true,
          proto_base64: bytesToBase64(protoBytes),
          model_base64: bytesToBase64(modelBytes),
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}
