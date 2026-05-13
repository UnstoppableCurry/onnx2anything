let runtimePromise;

async function loadPatchedRuntimeModule() {
  const sourceUrl = new URL('../paddlelite/paddle_lite_opt.js', import.meta.url);
  const sourceText = await fetch(sourceUrl).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load paddle_lite_opt.js: ${response.status}`);
    }
    return response.text();
  });

  let patched = sourceText;
  const wasmUrl = new URL('../paddlelite/paddle_lite_opt.wasm', import.meta.url).toString();

  if (patched.includes('var Module=typeof Module!="undefined"?Module:{};')) {
    patched = patched.replace(
      'var Module=typeof Module!="undefined"?Module:{};',
      'var __paddleLiteOptReadyResolve;var Module={noInitialRun:true,ready:new Promise((resolve)=>{__paddleLiteOptReadyResolve=resolve;}),onRuntimeInitialized(){Module.FS=FS;Module.callMain=callMain;__paddleLiteOptReadyResolve(Module);}};'
    );
  } else {
    patched =
      'var __paddleLiteOptReadyResolve;var Module={noInitialRun:true,ready:new Promise((resolve)=>{__paddleLiteOptReadyResolve=resolve;}),onRuntimeInitialized(){Module.FS=FS;Module.callMain=callMain;__paddleLiteOptReadyResolve(Module);}};\n' +
      patched;
  }

  if (!patched.includes('Module.locateFile = Module.locateFile ||')) {
    patched = patched.replace(
      'var scriptDirectory="";',
      `var scriptDirectory="";Module.locateFile = Module.locateFile || ((path) => path.endsWith('.wasm') ? ${JSON.stringify(wasmUrl)} : path);`
    );
  }

  if (!patched.includes('Module.FS=FS;Module.callMain=callMain;')) {
    patched = patched.replace(
      'if(Module["onRuntimeInitialized"])Module["onRuntimeInitialized"]();',
      'Module.FS=FS;Module.callMain=callMain;if(Module["onRuntimeInitialized"])Module["onRuntimeInitialized"]();'
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
  if (typeof runtime.callMain !== 'function') {
    throw new Error('Paddle Lite opt runtime did not expose callMain');
  }
  runtime.callMain(['--help']);
  return { success: true };
}

export function register(context) {
  context.register({
    id: 'paddlelite',
    async convert() {
      return JSON.stringify({
        success: false,
        error:
          'Paddle Lite 浏览器链路当前仍未打通：后半段 paddle_lite_opt.js/.wasm 可能已经存在，但它只覆盖 Paddle inference model -> .nb；前半段 ONNX -> Paddle 仍依赖 x2paddle + paddle Python 运行时。现阶段请继续使用 native/container export。',
      });
    },
  });
}
