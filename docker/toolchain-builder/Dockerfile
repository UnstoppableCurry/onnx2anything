FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    bash \
    ca-certificates \
    cmake \
    curl \
    emscripten \
    git \
    ninja-build \
    nodejs \
    npm \
    protobuf-compiler \
    libprotobuf-dev \
    python3 \
    python3-pip \
    python3-venv \
    rsync \
    xz-utils \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

ENV THREADS=8

CMD ["sleep", "infinity"]
