#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TARGET="${1:-all}"
THREADS="${THREADS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 8)}"
COMPOSE_FILE="$PROJECT_ROOT/docker/dev.yml"
SERVICE_NAME="${SERVICE_NAME:-toolchain-builder}"
CONTAINER_NAME="${CONTAINER_NAME:-onnx2anything-toolchain-builder}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: scripts/docker-build-toolchain.sh <all|ncnn|mnn|openvino|paddlelite>"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker compose -f "$COMPOSE_FILE" --profile tools up -d "$SERVICE_NAME"
fi

if [[ "$TARGET" == "all" ]]; then
  docker exec \
    -e THREADS="$THREADS" \
    "$CONTAINER_NAME" \
    bash /workspace/scripts/build-edge-toolchains.sh
else
  docker exec \
    -e THREADS="$THREADS" \
    "$CONTAINER_NAME" \
    bash /workspace/scripts/build-edge-toolchain.sh "$TARGET"
fi
