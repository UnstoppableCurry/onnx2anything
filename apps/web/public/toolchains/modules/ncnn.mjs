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
let optimizeModuleFactoryPromise;

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

async function loadNcnnOptimizeModule() {
  const sourceUrl = new URL('/toolchains/ncnn/ncnnoptimize.js', getToolchainBaseOrigin());
  const sourceText = await fetch(sourceUrl).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load ncnnoptimize.js: ${response.status}`);
    }
    return response.text();
  });

  const wasmUrl = resolveNcnnOptimizeWasmLocation();

  // ncnnoptimize.js is old-style Emscripten (no export default) — it runs inline and attaches
  // to a pre-defined Module object. callMain and FS are not exposed; we inject them.
  let patchedSource = sourceText
    // Inject pre-defined Module with noInitialRun + locateFile + onRuntimeInitialized
    .replace(
      'var Module=typeof Module!="undefined"?Module:{};',
      `var __ncnnOptResolve;
var Module={noInitialRun:true,print:function(){},printErr:function(){console.warn('[ncnnoptimize]',...arguments);},locateFile:function(p){return p.endsWith('.wasm')?${JSON.stringify(wasmUrl)}:p;},onRuntimeInitialized:function(){__ncnnOptResolve(Module);}};
var __ncnnOptReady=new Promise(function(r){__ncnnOptResolve=r;});`
    )
    // Expose FS on Module (FS is in-scope at this point)
    .replace(
      'Module["FS_createPath"]=FS.createPath;',
      'Module["FS"]=FS;Module["FS_createPath"]=FS.createPath;'
    )
    // Expose callMain on Module (callMain is in-scope at this point)
    .replace(
      'Module["run"]=run;',
      'Module["run"]=run;Module["callMain"]=callMain;'
    );
  patchedSource += `\nexport default __ncnnOptReady;`;

  const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(patchedSource)}`;
  const mod = await import(/* @vite-ignore */ dataUrl);
  const initializedModule = await (mod.default ?? mod);

  if (!initializedModule || typeof initializedModule.callMain !== 'function') {
    throw new Error('ncnnoptimize failed to initialize: callMain not available');
  }

  return initializedModule;
}

function resolveNcnnOptimizeWasmLocation() {
  const wasmUrl = new URL('/toolchains/ncnn/ncnnoptimize.wasm', getToolchainBaseOrigin());
  if (wasmUrl.protocol === 'file:') {
    return decodeURIComponent(wasmUrl.pathname);
  }
  return wasmUrl.toString();
}

async function getOptimizeModule() {
  if (!optimizeModuleFactoryPromise) {
    optimizeModuleFactoryPromise = loadNcnnOptimizeModule();
  }
  return optimizeModuleFactoryPromise;
}

async function createOptimizeModule() {
  return getOptimizeModule();
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
    async convert(input, optionsJson) {
      try {
        const options = JSON.parse(optionsJson || '{}');
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

        let finalParamPath = paramPath;
        let finalBinPath = binPath;

        if (options.quantization === 'fp16') {
          const optParamPath = '/workspace/model_fp16.param';
          const optBinPath = '/workspace/model_fp16.bin';

          try {
            module.FS.unlink(optParamPath);
          } catch {}

          try {
            module.FS.unlink(optBinPath);
          } catch {}

          const optimizeModule = await createOptimizeModule();

          try {
            optimizeModule.FS.mkdir('/workspace');
          } catch {}

          // Copy param and bin into the optimize module's FS
          const paramBytes = module.FS.readFile(paramPath);
          const binBytes = module.FS.readFile(binPath);
          optimizeModule.FS.writeFile(paramPath, paramBytes);
          optimizeModule.FS.writeFile(binPath, binBytes);

          try {
            optimizeModule.FS.unlink(optParamPath);
          } catch {}

          try {
            optimizeModule.FS.unlink(optBinPath);
          } catch {}

          // Flag 65536 = FP16 storage
          optimizeModule.callMain([paramPath, binPath, optParamPath, optBinPath, '65536']);

          if (optimizeModule.FS.analyzePath(optParamPath).exists) {
            // Read fp16 outputs from the optimize module's FS
            const fp16ParamBytes = optimizeModule.FS.readFile(optParamPath);
            const fp16BinBytes = optimizeModule.FS.readFile(optBinPath);

            // Write back into the main module's FS for uniform readback below
            module.FS.writeFile(optParamPath, fp16ParamBytes);
            module.FS.writeFile(optBinPath, fp16BinBytes);

            finalParamPath = optParamPath;
            finalBinPath = optBinPath;
          }
          // If optimize failed for any reason, fall through and return the unoptimized output
        }

        const paramText = module.FS.readFile(finalParamPath, { encoding: 'utf8' });
        const binBytes = module.FS.readFile(finalBinPath);

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
