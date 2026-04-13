#!/bin/bash
# Pyodide 构建脚本
# 下载和配置 Pyodide 运行时环境

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PYODIDE_DIR="$PROJECT_ROOT/apps/web/public/pyodide"
PYODIDE_VERSION="${PYODIDE_VERSION:-0.25.0}"

echo "=========================================="
echo "Pyodide Builder Script"
echo "=========================================="
echo "Version: $PYODIDE_VERSION"
echo "Target: $PYODIDE_DIR"
echo ""

# 创建目录
mkdir -p "$PYODIDE_DIR"

# Pyodide CDN 基础 URL
PYODIDE_CDN="https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full"

# 核心文件列表
PYODIDE_FILES=(
    "pyodide.js"
    "pyodide.asm.js"
    "pyodide.asm.wasm"
    "python_stdlib.zip"
    "pyodide-lock.json"
)

# 额外的核心包
CORE_PACKAGES=(
    "micropip-0.6-py3-none-any.whl"
    "packaging-23-py3-none-any.whl"
    "pyparsing-3.1.1-py3-none-any.whl"
)

echo "Downloading Pyodide core files..."
for file in "${PYODIDE_FILES[@]}"; do
    echo "  - $file"
    if [ ! -f "$PYODIDE_DIR/$file" ]; then
        curl -L --progress-bar -o "$PYODIDE_DIR/$file" "$PYODIDE_CDN/$file" || {
            echo "Failed to download $file"
            exit 1
        }
    else
        echo "    (already exists, skipping)"
    fi
done

echo ""
echo "Downloading core packages..."
for pkg in "${CORE_PACKAGES[@]}"; do
    echo "  - $pkg"
    if [ ! -f "$PYODIDE_DIR/$pkg" ]; then
        curl -L --progress-bar -o "$PYODIDE_DIR/$pkg" "$PYODIDE_CDN/$pkg" || {
            echo "Warning: Failed to download $pkg"
        }
    else
        echo "    (already exists, skipping)"
    fi
done

echo ""
echo "Creating Pyodide config..."
cat > "$PYODIDE_DIR/config.json" << EOF
{
  "version": "$PYODIDE_VERSION",
  "cdnUrl": "$PYODIDE_CDN",
  "indexURL": "./pyodide/",
  "stdout": "console.log",
  "stderr": "console.error",
  "fullStdLib": false,
  "packages": ["micropip", "numpy"]
}
EOF

echo ""
echo "Verifying downloads..."
for file in "${PYODIDE_FILES[@]}"; do
    if [ -f "$PYODIDE_DIR/$file" ]; then
        size=$(du -h "$PYODIDE_DIR/$file" | cut -f1)
        echo "  ✓ $file ($size)"
    else
        echo "  ✗ $file (MISSING)"
    fi
done

echo ""
echo "Total size:"
du -sh "$PYODIDE_DIR"

echo ""
echo "=========================================="
echo "Pyodide setup complete!"
echo "=========================================="
