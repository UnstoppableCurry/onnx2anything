# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

To report a security vulnerability, please open a [GitHub Security Advisory](https://github.com/UnstoppableCurry/onnx2anything/security/advisories/new).

We will acknowledge your report within 48 hours and provide a timeline for a fix.

## Scope

Since ONNX2Anything runs entirely in-browser with WebAssembly and processes files locally (no server involved), the main security considerations are:

- **Malicious ONNX files:** Files are processed client-side via Pyodide/WASM sandboxes
- **Supply chain:** WASM toolchain binaries and Python packages loaded at runtime
- **XSS / content injection** in the web interface

Thank you for helping keep ONNX2Anything safe.
