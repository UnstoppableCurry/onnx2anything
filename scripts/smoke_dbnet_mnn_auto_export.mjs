import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(projectRoot, 'apps/web/public');
const exportScriptPath = path.join(projectRoot, 'scripts/export-mnn-artifacts.mjs');

const modelUrlPath =
  process.argv[2] || '/verify/generated/ppocrv3_dbnet_no_identity.onnx';
const outPath =
  process.argv[3] || '/tmp/ppocrv3_dbnet_mnn_auto_smoke.mnn';

const CONTENT_TYPES = {
  '.bin': 'application/octet-stream',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.onnx': 'application/octet-stream',
  '.param': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

function getContentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream';
}

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const relative = normalized.replace(/^[/\\]+/, '') || 'index.html';
  const absolute = path.join(publicRoot, relative);

  if (!absolute.startsWith(publicRoot + path.sep) && absolute !== publicRoot) {
    return null;
  }

  return absolute;
}

function createStaticServer() {
  return http.createServer((req, res) => {
    const method = req.method || 'GET';
    if (!['GET', 'HEAD'].includes(method)) {
      res.writeHead(405);
      res.end();
      return;
    }

    const resolved = resolveRequestPath(req.url || '/');
    if (!resolved || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    res.writeHead(200, { 'Content-Type': getContentType(resolved) });
    if (method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(resolved).pipe(res);
  });
}

function runExport(baseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [exportScriptPath, baseUrl, modelUrlPath, outPath, '--fallback-native'],
      {
        cwd: projectRoot,
        stdio: 'inherit',
      }
    );

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`MNN export smoke failed with exit code ${code ?? 'null'}`));
    });
  });
}

const server = createStaticServer();

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve temporary static server address');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  await runExport(baseUrl);

  const stats = fs.statSync(outPath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`Expected a non-empty MNN file at ${outPath}`);
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        baseUrl,
        modelUrlPath,
        outPath,
        mnnBytes: stats.size,
      },
      null,
      2
    )
  );
} finally {
  await new Promise((resolve) => server.close(() => resolve()));
}
