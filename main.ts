// Token Radar — entrypoint (radar-2 model, Node 22+, standard library only).
//
// Pipeline: read the sealed snapshot, score every pre-token protocol with the
// comps-fitted curve in lib/model.ts, write the ranked board plus the data the
// static dashboard reads, copy the dashboard and screenshots into place, and
// finish with the dossier the judge reads, built by the vendored make.fun
// library. The gate's shape is fixed by the competition rules; the model, the
// page and the farm plans are the entry's own work.
//
// Run outside the grader's container (from this directory):
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  boardIssue,
  buildRadar,
  dataScript,
  parseSnapshot,
} from './lib/model.ts';
import {
  buildDossier,
} from './vendor/makefun-board.ts';

// This file's own directory: dashboard/ and screenshots/ live beside it.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the dossier text cap, the screenshot caps, the name rule. */
const DOSSIER_TEXT_CAP = 65_536;
const SHOT_LIMITS = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** `--name value` or `--name=value` from the command line, else `fallback`. */
function flagValue(name: string, fallback: string): string {
  const argv = process.argv;
  const flag = `--${name}`;
  const exact = argv.indexOf(flag);
  if (exact !== -1 && exact + 1 < argv.length) return argv[exact + 1]!;
  const joined = argv.find((a) => a.startsWith(`${flag}=`));
  return joined === undefined ? fallback : joined.slice(flag.length + 1);
}

const inputGiven = flagValue('input', '/input');
const snapshotPath = inputGiven.endsWith('.json') ? inputGiven : join(inputGiven, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  process.stderr.write(`token radar: no snapshot at ${snapshotPath} — pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}

const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const built = buildRadar(snapshot);
const { board, radar } = built;
const boardProblem = boardIssue(board, snapshot);
if (boardProblem !== null) {
  process.stderr.write(`token radar: the board fails the gate: ${boardProblem}\n`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

/** Copy a directory's plain files into `dest`, skipping dotfiles; returns the names copied. */
function copyDir(source: string, dest: string): string[] {
  if (!existsSync(source)) return [];
  mkdirSync(dest, { recursive: true });
  const names: string[] = [];
  for (const entry of readdirSync(source)) {
    if (entry.startsWith('.')) continue;
    const from = join(source, entry);
    if (!statSync(from).isFile()) continue;
    copyFileSync(from, join(dest, entry));
    names.push(entry);
  }
  return names;
}

copyDir(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'));
const shotNames = copyDir(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
if (shotNames.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shotNames.length} image${shotNames.length === 1 ? '' : 's'} — hand in 3 (board, detail, filtered)\n`);
  process.exit(1);
}
for (const shot of shotNames) {
  if (!SHOT_NAME.test(shot)) {
    process.stderr.write(`token radar: screenshots/${shot}: names use letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// Dossier last: the scorer rebuilds it from this output and compares bytes.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: DOSSIER_TEXT_CAP,
    screenshots: SHOT_LIMITS,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live)\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (3 files), ${join(outDir, 'screenshots')} (${shotNames.length} images), ${join(outDir, 'dossier.json')}\n`,
);
