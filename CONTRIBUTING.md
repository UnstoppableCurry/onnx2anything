# Contributing to ONNX2Anything

First off — thank you for considering a contribution! The most impactful thing you can do is **add a new output format**.

---

## Ways to Contribute

| Type | Examples |
|------|---------|
| 🆕 New format module | TFLite, CoreML, RKNN, ONNX Runtime |
| 🐛 Bug fix | Conversion failure, wrong output, UI issue |
| 📖 Documentation | Better README, format guides, architecture notes |
| 🧪 Tests | More e2e or unit test coverage |
| 💬 Issue / discussion | Format request, design feedback |

---

## Adding a New Format (Most Wanted!)

### Step 1 — Build the WASM toolchain

You need an Emscripten-compiled JS+WASM pair for your converter tool. The pattern is:

```
apps/web/public/toolchains/<format>/
  <tool>.js      # Emscripten-generated JS glue
  <tool>.wasm    # compiled WASM binary
  .browser-ready # empty sentinel file — presence means "ready"
```

See existing examples in `scripts/build-*-toolchain*.sh` for how NCNN, MNN, TNN, and Tengine were built.

### Step 2 — Write the bridge module

Create `apps/web/public/toolchains/modules/<format>.mjs`:

```javascript
export function register(context) {
  context.register({
    id: 'myformat',             // must match manifest id
    async convert(modelBuffer, options) {
      // 1. Dynamically import your Emscripten .js glue
      const { default: createModule } = await import('/toolchains/myformat/mytool.js');

      // 2. Initialise the module with locateFile pointing to your .wasm
      const module = await createModule({
        locateFile: (path) => `/toolchains/myformat/${path}`,
      });

      // 3. Write model to virtual FS
      module.FS.writeFile('/input.onnx', new Uint8Array(modelBuffer));

      // 4. Call the converter
      module.callMain(['--input', '/input.onnx', '--output', '/output.myformat']);

      // 5. Read and return result
      const output = module.FS.readFile('/output.myformat');
      return { success: true, data: output.buffer };
    },
  });
}
```

### Step 3 — Register in the manifest

Add an entry to `apps/web/public/toolchains/manifest.json`:

```json
{
  "id": "myformat",
  "label": "My Format",
  "description": "One-line description of the target framework.",
  "runtime": "wasm-module",
  "availability": "ready",
  "status": "experimental",
  "moduleUrl": "/toolchains/modules/myformat.mjs",
  "register": "register",
  "outputExtension": "myformat",
  "outputFilename": "model.myformat",
  "outputMime": "application/octet-stream"
}
```

### Step 4 — Write tests

Add an e2e test in `tests/e2e/<format>.spec.ts` that:
1. Uploads `tests/fixtures/add_const.onnx` (the standard smoke-test model)
2. Selects your format
3. Waits for download
4. Asserts the output is non-empty

Run: `npx playwright test tests/e2e/<format>.spec.ts --workers=1`

### Step 5 — Open a PR

Make sure `pnpm test` and `pnpm test:e2e` both pass on your branch.

---

## Development Setup

```bash
git clone https://github.com/UnstoppableCurry/onnx2anything.git
cd onnx2anything
pnpm install
cd apps/web && pnpm dev      # starts http://localhost:5173
```

```bash
pnpm test                    # unit tests
pnpm test:e2e                # e2e tests (needs dev server running)
```

---

## Code Style

- TypeScript everywhere in `apps/web/src`
- Bridge modules (`.mjs`) are plain ES modules — no TypeScript
- Keep each format module self-contained — no cross-format imports
- Prefer small, focused commits

---

## Questions?

Open a [GitHub Discussion](https://github.com/UnstoppableCurry/onnx2anything/discussions) or file an issue.
