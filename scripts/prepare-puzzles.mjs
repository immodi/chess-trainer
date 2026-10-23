#!/usr/bin/env node
/**
 * Builds src/data/puzzles.json from the Lichess puzzle database (SPEC 7.1).
 *
 * Usage:
 *   node scripts/prepare-puzzles.mjs
 *   node scripts/prepare-puzzles.mjs /path/to/lichess_db_puzzle.csv.zst
 *   node scripts/prepare-puzzles.mjs /path/to/lichess_db_puzzle.csv
 *
 * The first form downloads the compressed database to a temporary file. The
 * app never needs the network: the generated JSON is committed.
 */
import { createWriteStream, existsSync, statSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(HERE, '..', 'src', 'data', 'puzzles.json');

const RATING_MIN = 600;
const RATING_MAX = 1800;
const RATING_DEVIATION_MAX = 100;
const POPULARITY_MIN = 80;
const NB_PLAYS_MIN = 500;
const PER_THEME = 1500;
const BIN_SIZE = 100;
const BIN_COUNT = Math.ceil((RATING_MAX - RATING_MIN) / BIN_SIZE);
const PER_BIN = Math.ceil(PER_THEME / BIN_COUNT);
const MAX_BYTES = 8 * 1024 * 1024;

/** The themes the app has text for. */
const THEMES = [
  'hangingPiece',
  'fork',
  'pin',
  'skewer',
  'backRankMate',
  'discoveredAttack',
  'mateIn1',
  'mateIn2',
  'trappedPiece',
  'deflection',
  'attraction',
  'capturingDefender',
];
const THEME_ORDER = new Map(THEMES.map((theme, index) => [theme, index]));

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function requireZstd() {
  const check = spawnSync('zstd', ['--version'], { stdio: 'ignore' });
  if (check.error) {
    fail(
      'zstd is required to decompress the Lichess database.\n' +
        'Install it, or download the uncompressed CSV and pass that path instead.',
    );
    return false;
  }
  return true;
}

/** A tiny seeded PRNG so repeated runs from the same CSV produce the same sample. */
function makeRandom(seed = 0x9e3779b9) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
}

function toNumber(value) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function downloadDatabase() {
  const dir = await mkdtemp(join(tmpdir(), 'chess-trainer-puzzles-'));
  const path = join(dir, 'lichess_db_puzzle.csv.zst');
  console.log(`Downloading ${SOURCE_URL}`);
  console.log('This is about 300 MB; the filtered result is committed to src/data/puzzles.json.');

  const response = await fetch(SOURCE_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  let downloaded = 0;
  let nextReport = 50 * 1024 * 1024;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      downloaded += chunk.length;
      if (downloaded >= nextReport) {
        console.log(`  ${Math.round(downloaded / 1024 / 1024)} MB downloaded`);
        nextReport += 50 * 1024 * 1024;
      }
      callback(null, chunk);
    },
  });

  await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(path));
  console.log(`Downloaded ${Math.round(statSync(path).size / 1024 / 1024)} MB to ${path}`);
  return { path, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function openCsv(path) {
  const extension = extname(path).toLowerCase();
  if (extension === '.csv') return { stream: createReadStream(path), child: null };
  if (extension !== '.zst') {
    throw new Error(`Unsupported input extension: ${extension || '(none)'}. Pass a .csv or .csv.zst file.`);
  }
  if (!requireZstd()) return null;

  const child = spawn('zstd', ['-dc', path], { stdio: ['ignore', 'pipe', 'inherit'] });
  if (!child.stdout) throw new Error('Could not read zstd output.');
  return { stream: child.stdout, child };
}

async function main() {
  let inputPath = process.argv[2] ? resolve(process.argv[2]) : null;
  let cleanup = null;

  if (inputPath && !existsSync(inputPath)) {
    fail(`Input file does not exist: ${inputPath}`);
    return;
  }

  if (!inputPath) {
    try {
      const downloaded = await downloadDatabase();
      inputPath = downloaded.path;
      cleanup = downloaded.cleanup;
    } catch (error) {
      fail(
        `${error instanceof Error ? error.message : String(error)}\n\n` +
          'Download the database manually and pass its path:\n' +
          `  ${SOURCE_URL}\n` +
          '  node scripts/prepare-puzzles.mjs /path/to/lichess_db_puzzle.csv.zst',
      );
      return;
    }
  }

  const opened = await openCsv(inputPath);
  if (!opened) return;

  const lines = createInterface({ input: opened.stream, crlfDelay: Infinity });
  const random = makeRandom();
  const reservoirs = new Map(
    THEMES.map((theme) => [
      theme,
      Array.from({ length: BIN_COUNT }, () => ({ seen: 0, items: [] })),
    ]),
  );

  let header = null;
  let rows = 0;
  let candidates = 0;
  let lineNumber = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (lineNumber === 1) {
      header = parseCsvLine(line.replace(/^\uFEFF/, ''));
      const required = ['PuzzleId', 'FEN', 'Moves', 'Rating', 'RatingDeviation', 'Popularity', 'NbPlays', 'Themes'];
      const missing = required.filter((column) => !header.includes(column));
      if (missing.length > 0) {
        fail(`Unexpected CSV header; missing: ${missing.join(', ')}`);
        return;
      }
      continue;
    }

    if (line.trim().length === 0) continue;
    rows += 1;

    const fields = parseCsvLine(line);
    const get = (column) => fields[header.indexOf(column)] ?? '';
    const rating = toNumber(get('Rating'));
    const deviation = toNumber(get('RatingDeviation'));
    const popularity = toNumber(get('Popularity'));
    const plays = toNumber(get('NbPlays'));
    if (rating === null || deviation === null || popularity === null || plays === null) continue;
    if (rating < RATING_MIN || rating > RATING_MAX) continue;
    if (deviation >= RATING_DEVIATION_MAX) continue;
    if (popularity < POPULARITY_MIN || plays < NB_PLAYS_MIN) continue;

    const themes = get('Themes').split(/\s+/).filter((theme) => THEME_ORDER.has(theme));
    if (themes.length === 0) continue;

    const id = get('PuzzleId');
    const fen = get('FEN');
    const moves = get('Moves');
    if (!id || !fen || !moves) continue;

    candidates += 1;
    const puzzle = { id, fen, moves, rating };
    const bin = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((rating - RATING_MIN) / BIN_SIZE)));

    for (const theme of themes) {
      const bucket = reservoirs.get(theme)?.[bin];
      if (!bucket) continue;
      bucket.seen += 1;
      if (bucket.items.length < PER_BIN) {
        bucket.items.push(puzzle);
      } else {
        const slot = Math.floor(random() * bucket.seen);
        if (slot < PER_BIN) bucket.items[slot] = puzzle;
      }
    }
  }

  if (opened.child) {
    await new Promise((resolveClose, rejectClose) => {
      opened.child.once('error', rejectClose);
      opened.child.once('close', (code) => {
        if (code === 0) resolveClose();
        else rejectClose(new Error(`zstd exited with code ${code}`));
      });
    });
  }

  const selected = new Map();
  for (const theme of THEMES) {
    for (const bucket of reservoirs.get(theme) ?? []) {
      for (const puzzle of bucket.items) {
        let entry = selected.get(puzzle.id);
        if (!entry) {
          entry = { puzzle, themes: new Set() };
          selected.set(puzzle.id, entry);
        }
        entry.themes.add(theme);
      }
    }
  }

  const puzzles = [...selected.values()]
    .map(({ puzzle, themes }) => ({
      ...puzzle,
      themes: [...themes].sort((a, b) => (THEME_ORDER.get(a) ?? 0) - (THEME_ORDER.get(b) ?? 0)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const json = `${JSON.stringify(puzzles)}\n`;
  const bytes = Buffer.byteLength(json);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(OUT_PATH, json);

  const perTheme = new Map(THEMES.map((theme) => [theme, 0]));
  for (const puzzle of puzzles) {
    for (const theme of puzzle.themes) perTheme.set(theme, (perTheme.get(theme) ?? 0) + 1);
  }

  console.log(`Rows read: ${rows}`);
  console.log(`Candidates matching filters: ${candidates}`);
  console.log(`Unique puzzles kept: ${puzzles.length}`);
  for (const theme of THEMES) console.log(`  ${theme}: ${perTheme.get(theme) ?? 0}`);
  console.log(`Wrote ${OUT_PATH} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);

  if (bytes > MAX_BYTES) {
    console.warn(
      `Warning: output is larger than ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB. ` +
        'Reduce PER_THEME in scripts/prepare-puzzles.mjs and re-run.',
    );
  }

  if (cleanup) await cleanup();
}

main().catch((error) => {
  fail(error instanceof Error ? error.stack ?? error.message : String(error));
});
