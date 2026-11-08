const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const watch = process.argv.includes('--watch');

const copySqlWasm = () => {
  const source = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const destinationDir = path.join(__dirname, 'out', 'vendor');
  fs.mkdirSync(destinationDir, { recursive: true });
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(destinationDir, 'sql-wasm.wasm'));
};

const options = {
  entryPoints: ['src/extension.ts'], bundle: true, platform: 'node', format: 'cjs',
  target: 'node20', outfile: 'out/extension.js', external: ['vscode'],
  sourcemap: true, minify: false, logLevel: 'info'
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context({ ...options, plugins: [{ name: 'copy-sql-wasm', setup(build) { build.onEnd(copySqlWasm); } }] });
    await ctx.watch();
  } else {
    await esbuild.build(options);
    copySqlWasm();
  }
})();
