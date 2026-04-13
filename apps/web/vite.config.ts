import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { mkdirSync, existsSync, cpSync } from 'fs'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { execFileSync } from 'child_process'

const WEB_ROOT = __dirname
const PROJECT_ROOT = resolve(__dirname, '../..')
const LOCAL_PYODIDE_DIR = resolve(WEB_ROOT, 'node_modules/pyodide')

function syncWasmConverterAssets() {
  try {
    execFileSync('node', ['scripts/sync-wasm-converter-assets.mjs'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    })
    return true
  } catch (error) {
    console.warn('Failed to sync wasm-converter public assets.', error)
    return false
  }
}

function syncPyodideModule() {
  if (!existsSync(LOCAL_PYODIDE_DIR)) {
    console.warn('Local pyodide package not found in node_modules.')
    return false
  }

  const publicPyodideDir = resolve(WEB_ROOT, 'public/pyodide')
  cpSync(LOCAL_PYODIDE_DIR, publicPyodideDir, {
    force: true,
    recursive: true,
  })

  return true
}

// 自定义插件：复制 Pyodide 文件
const pyodidePlugin = () => ({
  name: 'pyodide-copy',
  configureServer() {
    syncWasmConverterAssets()
    syncPyodideModule()
  },
  buildStart() {
    syncWasmConverterAssets()
    syncPyodideModule()
    // 确保 Pyodide 目录存在
    const pyodideDir = resolve(__dirname, 'public/pyodide')
    if (!existsSync(pyodideDir)) {
      console.warn('Pyodide directory not found. Run scripts/build-pyodide.sh first.')
    }
  },
  writeBundle() {
    // 复制 Pyodide 到 dist 目录
    const srcDir = resolve(__dirname, 'public/pyodide')
    const destDir = resolve(__dirname, 'dist/pyodide')

    if (existsSync(srcDir) && !existsSync(destDir)) {
      try {
        mkdirSync(destDir, { recursive: true })
        // 使用 build-pyodide.sh 已经下载的文件
        console.log('Pyodide files will be copied by build process')
      } catch (e) {
        console.error('Failed to setup Pyodide directory:', e)
      }
    }
  }
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), pyodidePlugin()],

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@components': resolve(__dirname, './src/components'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@utils': resolve(__dirname, './src/utils'),
      '@workers': resolve(__dirname, './src/workers'),
      'node-fetch': resolve(__dirname, './src/shims/node-fetch.ts'),
    },
  },

  server: {
    port: 5173,
    host: '0.0.0.0',
    // COOP/COEP headers required for SharedArrayBuffer (Pyodide)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
    // 热重载配置
    hmr: {
      overlay: true,
    },
    // 文件监听
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },

  preview: {
    port: 4173,
    host: '0.0.0.0',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  },

  // Worker 配置
  worker: {
    format: 'es',
    // Worker 也需要 COEP headers
    rollupOptions: {
      output: {
        entryFileNames: 'assets/workers/[name]-[hash].js',
      },
    },
  },

  // 依赖优化
  optimizeDeps: {
    exclude: ['pyodide'],
    include: ['react', 'react-dom', 'comlink'],
    esbuildOptions: {
      target: 'esnext',
    },
  },

  // 构建配置
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: mode !== 'production',
    minify: mode === 'production' ? 'esbuild' : false,

    // Rollup 选项
    rollupOptions: {
      output: {
        // 代码分割策略
        manualChunks: {
          // Pyodide 单独打包（大体积）
          pyodide: ['pyodide'],
          // React 核心
          vendor: ['react', 'react-dom'],
          // UI 组件库
          ui: ['sonner'],
        },
        // 资源文件名
        entryFileNames: 'assets/js/[name]-[hash].js',
        chunkFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name || ''
          // WASM 文件特殊处理
          if (info.endsWith('.wasm')) {
            return 'assets/wasm/[name]-[hash][extname]'
          }
          // Pyodide 相关文件
          if (info.includes('pyodide') || info.endsWith('.whl') || info.endsWith('.data')) {
            return 'pyodide/[name][extname]'
          }
          // 图片资源
          if (/\.(png|jpe?g|gif|svg|webp|ico)$/.test(info)) {
            return 'assets/images/[name]-[hash][extname]'
          }
          // CSS
          if (info.endsWith('.css')) {
            return 'assets/css/[name]-[hash][extname]'
          }
          // 字体
          if (/\.(woff2?|ttf|otf|eot)$/.test(info)) {
            return 'assets/fonts/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        },
      },
    },

    // 资源限制
    assetsInlineLimit: 4096, // 4KB 以下的资源内联

    // 代码压缩
    cssMinify: mode === 'production',

    // 报告压缩后大小
    reportCompressedSize: mode === 'production',

    // 空 chunk 警告
    emptyOutDir: true,
  },

  // 实验性功能
  experimental: {
    // 启用 renderBuiltUrl 以支持自定义资源 URL
    renderBuiltUrl(filename) {
      // 确保 WASM 文件使用正确的 MIME 类型加载
      if (filename.endsWith('.wasm')) {
        return { relative: true }
      }
      return { relative: true }
    },
  },

  // CSS 配置
  css: {
    devSourcemap: true,
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },

  // 定义全局常量
  define: {
    __PYODIDE_VERSION__: JSON.stringify(process.env.PYODIDE_VERSION || '0.25.1'),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.1.0'),
  },
}))
