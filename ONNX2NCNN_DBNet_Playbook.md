# ONNX2NCNN DBNet Playbook

## Goal

Verify the browser-side `onnx2ncnn` toolchain end to end with a real OCR text-detection model, not a toy graph.

Validated chain:

`PaddleOCR DBNet detector -> paddle2onnx -> ONNX Runtime baseline -> browser onnx2ncnn -> native NCNN runtime`

## Verified model

- Official PaddleOCR detector: `PP-OCRv3_mobile_det_infer`
- Source:
  `https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv3_mobile_det_infer.tar`

This is a DB-style text detector used by PaddleOCR.

## Working result

The raw `paddle2onnx` export contains many `Identity` nodes.

- Raw ONNX -> `onnx2ncnn`: conversion succeeds
- Raw ONNX -> NCNN runtime: load fails because `Identity` is unsupported in the current `onnx2ncnn` path
- After stripping `Identity` nodes from the ONNX graph:
  - ONNX Runtime inference succeeds
  - `onnx2ncnn` conversion succeeds
  - NCNN runtime inference succeeds
  - ONNX Runtime and NCNN outputs match

This path is now automated by:

```bash
npm run test:compare:dbnet
```

Observed comparison result on random input:

- Input shape: `(1, 3, 64, 64)`
- ONNX output shape: `(1, 1, 64, 64)`
- NCNN output shape: `(1, 64, 64)`
- Comparison rule: squeeze the singleton channel dimension on the ONNX output
- `max_abs_diff = 2.1696090698242188e-05`
- `mean_abs_diff = 2.1696090698242188e-05`
- `allclose = True` with `atol=1e-4`, `rtol=1e-4`

## Commands

### 1. Build the browser-side NCNN toolchain

```bash
bash scripts/build-edge-toolchain.sh ncnn
```

This produces:

- `apps/web/public/toolchains/ncnn/onnx2ncnn.js`
- `apps/web/public/toolchains/ncnn/onnx2ncnn.wasm`
- `apps/web/public/toolchains/modules/ncnn.mjs`

### 2. Run generic ONNX vs NCNN parity tests

```bash
npm run test:compare:ncnn
```

Current covered toy-but-real operators:

- `Add(const)`
- `Gemm`

### 3. Run DBNet full-chain parity test

```bash
npm run test:compare:dbnet
```

This does all of the following automatically:

1. Download official PaddleOCR DBNet detector
2. Convert Paddle model to ONNX with `paddle2onnx`
3. Remove `Identity` nodes from the ONNX graph
4. Export NCNN artifacts in browser via `onnx2ncnn`
5. Run ONNX Runtime and NCNN inference
6. Compare raw outputs numerically

Current verified sample input shapes:

- `(1, 3, 64, 64)`
- `(1, 3, 96, 128)`
- `(1, 3, 160, 160)`

## Important implementation details

### 1. `onnx2ncnn` legacy status

`onnx2ncnn` is legacy in the ncnn ecosystem. ncnn recommends `pnnx` for many modern models.

That matters because:

- Some modern YOLO exports convert to `param/bin` but still fail at NCNN runtime
- DBNet is workable only after graph cleanup

### 2. Why DBNet worked

DBNet became usable after removing `Identity` nodes from the ONNX graph.

So the current practical rule is:

- If `onnx2ncnn` converts but NCNN runtime rejects the graph, inspect the exported ONNX for removable graph-noise operators first

### 3. Browser preview status

The production preview app is now green for the `NCNN` path:

- Uploading `PP-OCRv3_mobile_det_no_identity.onnx` in the real app preview succeeds
- Selecting `NCNN` stays on the ready wasm-module path
- The app produces `model.ncnn.zip`
- The app no longer falls back into the Pyodide `micropip install onnx` failure mode for `NCNN`

Useful smoke command:

```bash
node scripts/smoke_dbnet_export.mjs http://127.0.0.1:4184/ /tmp/dbnet_compare/PP-OCRv3_mobile_det_no_identity.onnx
```

Observed browser result:

- Downloaded filename: `model.ncnn.zip`
- Model info card rendered successfully
- No `无效的 ONNX 文件格式`
- No `无法解析模型`

The remaining deployment work is now outside the verified `NCNN` export path and mainly concerns the next formats (`MNN`, `OpenVINO`, `PaddleLite`) plus the Pyodide-based chains.

### 4. Deployment-specific browser issue already fixed

These issues were already resolved:

- `pyodide.mjs` and runtime asset version mismatch
- Missing worker `jsglobals` like `setTimeout`
- ONNX upload validation being too strict for real protobuf-serialized ONNX files
- The model info panel previously treated valid ONNX protobuf as text and falsely reported `无效的 ONNX 文件格式`

## Current status by format

- `NCNN`: real browser-side conversion working, app preview smoke green
- `MNN`: host-side correct result verified; browser-side wrapper now converts `add_const.onnx`, but DBNet still OOMs in-browser and should remain build-required until memory strategy is improved
- `OpenVINO`: build-required
- `PaddleLite`: build-required
- `TFLite/CoreML`: still on Pyodide path

## Suggested GitHub submission summary

Use this shape for the PR or issue summary:

1. Built a real browser-side `onnx2ncnn` wasm toolchain from vendored ncnn sources
2. Added manifest-driven ready/build-required runtime status for edge backends
3. Verified ONNX vs NCNN parity on `Add` and `Gemm`
4. Verified full DBNet chain:
   PaddleOCR DBNet -> paddle2onnx -> stripped ONNX -> browser onnx2ncnn -> NCNN runtime
5. Confirmed DBNet output parity within `1e-4`
6. Verified the real app preview exports `model.ncnn.zip` without falling back to Pyodide for `NCNN`
7. Fixed ONNX model metadata parsing in the browser app so valid protobuf models no longer show false invalid-format errors

## Additional Verified Path

- `DBNet -> MNN` also passes parity when using host-side `MNNConvert` (not browser-side wasm wrapper yet).
- Input shape tested: `(1, 3, 64, 64)`
- ONNX Runtime output shape: `(1, 1, 64, 64)`
- MNN output shape: `(1, 1, 64, 64)`
- `max_abs_diff = 1.1786733367102897e-08`
- `mean_abs_diff = 5.201251929154438e-11`
- `allclose = True` with `atol=1e-4`, `rtol=1e-4`

## Browser-side MNN update

- After sanitizing the generated `MNNConvert.wasm` tail and running `wasm-emscripten-finalize`, the browser-side `mnn.mjs` wrapper can successfully convert `add_const.onnx`.
- `verify-onnx2mnn.html?model=/verify/generated/add_const.onnx` now returns:

```json
{
  "success": true,
  "mnnBytes": 584
}
```

- The remaining blocker for promoting `MNN` to browser-ready is memory pressure on real models:
  `ppocrv3_dbnet_no_identity.onnx` still aborts with `OOM` in-browser even after increasing initial wasm memory in the wrapper.

## MNN export fallback

The practical export path for real models is now:

`browser MNN attempt -> OOM detection -> native MNNConvert fallback inside container`

Useful commands:

```bash
npm run export:mnn:auto -- http://127.0.0.1:8766 /verify/generated/ppocrv3_dbnet_no_identity.onnx /tmp/ppocrv3_dbnet.auto.mnn
```

```bash
npm run test:smoke:mnn:auto
```

Current observed result for DBNet:

- browser-side wasm attempt still aborts with `OOM`
- fallback switches to `/workspace/third_party/MNN/build-host-converter/MNNConvert`
- exported output size: `2330656` bytes
- `node scripts/smoke_dbnet_mnn_auto_export.mjs` passes end to end

This means:

- `MNN` is still not browser-ready
- real-model export is no longer blocked, because the CLI path auto-recovers to native conversion
