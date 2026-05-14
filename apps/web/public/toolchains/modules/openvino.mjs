export function register(context) {
  context.register({
    id: 'openvino',
    async convert() {
      return JSON.stringify({
        success: false,
        error:
          'OpenVINO browser wrapper is scaffolded, but ovc.js/ovc.wasm has not been produced yet.',
      });
    },
  });
}
