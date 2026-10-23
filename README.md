# Chess Trainer

An offline Android chess trainer for one specific person: a beginner who blunders, takes moves back, and doesn't know *why* a move is good or bad.

Stockfish can tell you that a move was bad. This app tries to tell you **why**, in plain sentences, and forces a "look before you move" habit. The coach layer is the product; everything else supports it.

`SPEC.md` is the source of truth for behaviour, architecture and phases. `AGENTS.md` has the working conventions.

## Status

**Phase 0 complete** — scaffold, static board, and Stockfish running in the app.

| Phase | Scope | State |
|---|---|---|
| 0 | Scaffold, Docker/CI pipeline, board renders, engine self-test | done |
| 1 | Board interaction, engine wrapper, opponent, Play mode, threats, settings, home | next |
| 2 | Move classification, detectors, feedback, game review, mistakes deck, glossary | planned |
| 3 | Puzzle import, Find the threat, Hanging pieces, Tactics, Endgames, Progress | planned |
| 4 | Polish: haptics, animations, About, icon, performance pass | planned |

What you can do today: install the APK, see a board, and watch the engine answer `go depth 8` on the start position.

## Install

Debug APK: `dist-apk/chess-trainer-debug.apk` after a local build, or the `chess-trainer-debug-apk` artifact from the latest CI run.

```sh
adb install -r dist-apk/chess-trainer-debug.apk
```

Or copy the file to the phone and allow "install unknown apps". The app needs no account, no network, and no permissions beyond Capacitor's debug leftovers.

## Commands

```sh
npm install            # also copies the Stockfish wasm into public/stockfish
npm run dev            # browser dev server, engine included
npm test               # Vitest
npm run typecheck      # tsc --noEmit
npm run build          # typecheck + production web build
./build-apk.sh         # debug APK via Docker -> dist-apk/
```

Releases are cut by tag: `git tag v0.2.0 && git push origin v0.2.0`. CI rebuilds, tests, and publishes the APK to GitHub Releases.

`build-apk.sh` runs entirely inside `capgo/capacitor:latest` (Node 24, JDK 21, Android SDK 36). CI calls the same script, so a local build and a CI build are the same build. The first run downloads Gradle and takes a while; the Gradle cache is reused after that.

Android is not a prerequisite: `npx cap add android` was run once and the generated project is committed. `npx cap sync android` re-copies web assets before a native build.

## Layout

```
src/coach/      pure functions: detectors, SEE, threats, classification (no DOM, no engine)
src/engine/     UCI client over a Web Worker, opponent move selection, eval maths
src/modes/      one module per game mode
src/ui/         React screens, board component, shared widgets
src/storage/    IndexedDB settings, progress, saved games
src/data/       generated puzzles, theme text, endgame positions
tests/          mirrors src/coach and src/engine
scripts/        copy-stockfish.mjs (postinstall), prepare-puzzles.mjs (one-time, needs network)
```

Rules that override everything else are in `SPEC.md` §2 — notably: a move is played the instant you tap a legal square, there are no take-backs anywhere, illegal taps are silently ignored, and the app never invents a coaching reason that no detector or engine result supports.

## Engine

Stockfish 19, lite single-threaded WASM build, run in a Web Worker. `scripts/copy-stockfish.mjs` copies it from `node_modules/stockfish/bin` to `public/stockfish/engine.js` + `engine.wasm`.

The two file names must stay in sync: the build looks for its wasm named after its own script (`engine.js` → `engine.wasm`) relative to the worker URL. Renaming one without the other produces a 404 and then a MIME-type error from `WebAssembly.instantiateStreaming`.

## Data

Fully offline after install. Puzzles come from the [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0), prepared once on a desktop with `scripts/prepare-puzzles.mjs` and committed as `src/data/puzzles.json`. The app itself never makes a network request.

## Licences

- **Stockfish** — GPL v3. The APK bundles it, so if this is ever distributed the source must be made available. Credited in the About screen.
- **Cburnett piece set** — CC BY-SA 3.0, see `public/pieces/cburnett/README.md`.
- **Lichess puzzle database** — CC0.
- **chess.js** — BSD-2-Clause.

## Development notes

- TypeScript `strict`, no `any`. Small files, one responsibility each.
- `src/coach/` is pure and tested with FEN fixtures, positive and negative per detector. Fixtures are verified with chess.js before they're trusted.
- Decisions, deviations from the spec, pinned versions and workarounds are recorded in `SPEC.md` §14.
