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
  throw new Error('Unable to resolve browser origin for NCNN toolchain');
}

async function loadOnnx2NcnnFactory() {
  const sourceUrl = new URL('/toolchains/ncnn/onnx2ncnn.js', getToolchainBaseOrigin());
  const sourceText = await fetch(sourceUrl).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load onnx2ncnn.js: ${response.status}`);
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
    throw new Error('onnx2ncnn runtime did not expose a callable module factory');
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

  throw new Error('NCNN converter expects a base64 string or Uint8Array input');
}

function resolveWasmLocation() {
  const wasmUrl = new URL('/toolchains/ncnn/onnx2ncnn.wasm', getToolchainBaseOrigin());
  if (wasmUrl.protocol === 'file:') {
    return decodeURIComponent(wasmUrl.pathname);
  }
  return wasmUrl.toString();
}

function resolveNcnnAsset(path) {
  return new URL(`/toolchains/ncnn/${path}`, getToolchainBaseOrigin()).toString();
}

async function getModuleFactory() {
  if (!moduleFactoryPromise) {
    moduleFactoryPromise = loadOnnx2NcnnFactory();
  }

  return moduleFactoryPromise;
}

async function createModule() {
  const createOnnx2NcnnModule = await getModuleFactory();
  return createOnnx2NcnnModule({
    noInitialRun: true,
    print: () => {},
    printErr: (...messages) => {
      console.warn('[onnx2ncnn]', ...messages);
    },
    locateFile(path) {
      if (path.endsWith('.wasm')) {
        return resolveWasmLocation();
      }
      return resolveNcnnAsset(path);
    },
  });
}

export function register(context) {
  context.register({
    id: 'ncnn',
    async convert(input) {
      try {
        const module = await createModule();
        const inputPath = '/workspace/input.onnx';
        const paramPath = '/workspace/model.param';
        const binPath = '/workspace/model.bin';
        const inputBytes = normalizeInputBytes(input);

        try {
          module.FS.mkdir('/workspace');
        } catch {}

        try {
          module.FS.unlink(inputPath);
        } catch {}

        try {
          module.FS.unlink(paramPath);
        } catch {}

        try {
          module.FS.unlink(binPath);
        } catch {}

        module.FS.writeFile(inputPath, inputBytes);
        module.callMain([inputPath, paramPath, binPath]);

        const paramText = module.FS.readFile(paramPath, { encoding: 'utf8' });
        const binBytes = module.FS.readFile(binPath);

        try {
          module.FS.unlink(inputPath);
        } catch {}

        try {
          module.FS.unlink(paramPath);
        } catch {}

        try {
          module.FS.unlink(binPath);
        } catch {}

        return JSON.stringify({
          success: true,
          param_base64: btoa(paramText),
          bin_base64: bytesToBase64(binBytes),
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
