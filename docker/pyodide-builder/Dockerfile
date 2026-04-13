# Pyodide Builder Dockerfile
# 用于构建自定义 Pyodide 包，支持 ONNX 转换工具链

FROM node:20-bookworm-slim AS base

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    wget \
    curl \
    build-essential \
    cmake \
    ninja-build \
    pkg-config \
    libffi-dev \
    libssl-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    libncursesw5-dev \
    xz-utils \
    tk-dev \
    libxml2-dev \
    libxmlsec1-dev \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /build

# Pyodide 版本
ARG PYODIDE_VERSION=0.25.0
ENV PYODIDE_VERSION=${PYODIDE_VERSION}

# 下载 Pyodide 源码
RUN git clone --depth 1 --branch v${PYODIDE_VERSION} \
    https://github.com/pyodide/pyodide.git /build/pyodide

WORKDIR /build/pyodide

# 安装 Pyodide 构建依赖
RUN pip3 install --break-system-packages \
    pyodide-build==${PYODIDE_VERSION} \
    pyodide-cli \
    emscripten==3.1.46

# 安装 EMScripten
RUN pyodide config get emscripten_version || true

# 第二阶段：构建自定义包
FROM base AS builder

WORKDIR /build/pyodide

# 复制自定义包配置
COPY packages/ /build/custom-packages/

# 创建构建脚本
RUN cat > /build/build-packages.sh << 'EOF'
#!/bin/bash
set -e

export PYODIDE_ROOT=/build/pyodide
export PATH="/build/pyodide/emsdk:/build/pyodide/emsdk/upstream/emscripten:$PATH"

cd /build/pyodide

# 构建核心包
echo "Building core packages..."

# onnx 依赖 - numpy
pyodide build-recipes numpy --install

# 构建 protobuf (onnx 依赖)
pyodide build-recipes protobuf --install

# 构建 onnx
pyodide build-recipes onnx --install

# 构建 onnx-simplifier 依赖
pyodide build-recipes rich --install

# 复制构建产物
mkdir -p /output/wheels
find /build/pyodide/dist -name "*.whl" -exec cp {} /output/wheels/ \;

echo "Build complete!"
ls -la /output/wheels/
EOF

RUN chmod +x /build/build-packages.sh

# 输出目录
VOLUME ["/output"]

# 默认命令
CMD ["/build/build-packages.sh"]
