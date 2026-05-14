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
  throw new Error('Unable to resolve browser origin for Tengine toolchain');
}

async function loadTengineConvertFactory() {
  const sourceUrl = new URL('/toolchains/tengine/TengineConvert.js', getToolchainBaseOrigin());
  const sourceText = await fetch(sourceUrl).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load TengineConvert.js: ${response.status}`);
    }
    return response.text();
  });

  let patchedSource = sourceText
    .replace(
      'var _scriptName = import.meta.url;',
      `var _scriptName = ${JSON.stringify(sourceUrl.toString())};`
    )
    .replace(
      'var _scriptDir = import.meta.url;',
      `var _scriptDir = ${JSON.stringify(sourceUrl.toString())};`
    )
    .replace(
      /new Worker\(new URL\(import\.meta\.url\)/g,
      `new Worker(new URL(${JSON.stringify(sourceUrl.toString())})`
    )
    .replace(
      /const __dirname = new URL\('\.', import\.meta\.url\)\.pathname\.replace\(\/\\\/\$\/, ''\);/,
      `const __dirname = ${JSON.stringify(decodeURIComponent(sourceUrl.pathname.replace(/\/[^/]*$/, '')))};`
    );

  const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(patchedSource)}`;
  const module = await import(/* @vite-ignore */ dataUrl);
  const factory = module.default ?? module;

  if (typeof factory !== 'function') {
    throw new Error('TengineConvert runtime did not expose a callable module factory');
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

  throw new Error('Tengine converter expects a base64 string or Uint8Array input');
}

function resolveWasmLocation() {
  const wasmUrl = new URL('/toolchains/tengine/TengineConvert.wasm', getToolchainBaseOrigin());
  if (wasmUrl.protocol === 'file:') {
    return decodeURIComponent(wasmUrl.pathname);
  }
  return wasmUrl.toString();
}

function resolveTengineAsset(path) {
  return new URL(`/toolchains/tengine/${path}`, getToolchainBaseOrigin()).toString();
}

async function getModuleFactory() {
  if (!moduleFactoryPromise) {
    moduleFactoryPromise = loadTengineConvertFactory().catch((err) => {
      moduleFactoryPromise = undefined; // allow retry on transient failures
      throw err;
    });
  }
  return moduleFactoryPromise;
}

async function createModule() {
  const createTengineConvertModule = await getModuleFactory();
  const stderrLines = [];
  return createTengineConvertModule({
    noInitialRun: true,
    print: () => {},
    printErr: (...messages) => {
      stderrLines.push(messages.join(' '));
      console.warn('[TengineConvert]', ...messages);
    },
    locateFile(path) {
      if (path.endsWith('.wasm')) {
        return resolveWasmLocation();
      }
      return resolveTengineAsset(path);
    },
    _stderrLines: stderrLines,
  });
}

export function register(context) {
  context.register({
    id: 'tengine',
    async convert(input, optionsJson) {
      try {
        const module = await createModule();
        const inputPath = '/workspace/model.onnx';
        const outputPath = '/workspace/model.tmfile';
        const inputBytes = normalizeInputBytes(input);

        try {
          module.FS.mkdir('/workspace');
        } catch {}

        try { module.FS.unlink(inputPath); } catch {}
        try { module.FS.unlink(outputPath); } catch {}

        module.FS.writeFile(inputPath, inputBytes);

        // convert_tool -f onnx -m <input.onnx> -o <output.tmfile>
        const args = ['-f', 'onnx', '-m', inputPath, '-o', outputPath];

        module.callMain(args);

        if (!module.FS.analyzePath(outputPath).exists) {
          const stderr = (module._stderrLines || []).join('\n') || '(no output)';
          return JSON.stringify({
            success: false,
            error: `Tengine convert_tool produced no output. Stderr: ${stderr}`,
          });
        }

        const outputBytes = module.FS.readFile(outputPath);

        try { module.FS.unlink(inputPath); } catch {}
        try { module.FS.unlink(outputPath); } catch {}

        return JSON.stringify({
          success: true,
          output_base64: bytesToBase64(outputBytes),
          output_filename: 'model.tmfile',
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
