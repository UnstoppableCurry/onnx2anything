import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Test paddle_lite_opt.js
process.argv = ['node', 'opt', '--help'];
