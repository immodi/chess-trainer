// Copies the Stockfish "lite, single-threaded" WASM build out of node_modules
// into public/stockfish/ under stable file names, so the app never has to know
// which upstream version is installed.
//
// Important: the build looks for its .wasm named after its own script file
// (basename(engine.js) + ".wasm" -> engine.wasm), relative to the script URL.
// Keep the two names in sync; renaming one without the other breaks loading.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', 'stockfish');
const binDir = join(pkgDir, 'bin');
const outDir = join(root, 'public', 'stockfish');

const OUT_JS = 'engine.js';
const OUT_WASM = 'engine.wasm';

const outJs = join(outDir, OUT_JS);
const outWasm = join(outDir, OUT_WASM);
const outBuild = join(outDir, 'build.json');

if (!existsSync(binDir)) {
  console.warn('[copy-stockfish] node_modules/stockfish not installed yet; skipping.');
  process.exit(0);
}

const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const buildVersion = String(pkg.buildVersion ?? '');
const candidates = readdirSync(binDir).filter((name) => /-lite-single\.js$/.test(name));

if (candidates.length === 0) {
  console.error('[copy-stockfish] No "*-lite-single.js" build found in node_modules/stockfish/bin.');
  console.error('[copy-stockfish] Found: ' + readdirSync(binDir).join(', '));
  process.exit(1);
}

const jsName = candidates[0];
const wasmName = jsName.replace(/\.js$/, '.wasm');
const jsPath = join(binDir, jsName);
const wasmPath = join(binDir, wasmName);

if (!existsSync(wasmPath)) {
  console.error(`[copy-stockfish] Missing ${wasmName} next to ${jsName}.`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const buildInfo = `${JSON.stringify(
  {
    package: `stockfish@${pkg.version}`,
    build: buildVersion,
    variant: 'lite-single',
    source: jsName,
  },
  null,
  2,
)}\n`;

const upToDate =
  existsSync(outJs) &&
  existsSync(outWasm) &&
  statSync(outJs).size === statSync(jsPath).size &&
  statSync(outWasm).size === statSync(wasmPath).size &&
  existsSync(outBuild) &&
  readFileSync(outBuild, 'utf8') === buildInfo;

if (upToDate) {
  console.log(`[copy-stockfish] up to date (${jsName})`);
  process.exit(0);
}

copyFileSync(jsPath, outJs);
copyFileSync(wasmPath, outWasm);
writeFileSync(outBuild, buildInfo);

const kb = (path) => `${Math.round(statSync(path).size / 1024)} KB`;
console.log(`[copy-stockfish] ${jsName} -> public/stockfish/${OUT_JS} (${kb(outJs)})`);
console.log(`[copy-stockfish] ${wasmName} -> public/stockfish/${OUT_WASM} (${kb(outWasm)})`);
