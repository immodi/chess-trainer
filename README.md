# Chess Trainer

An offline Android chess trainer for one specific person: a beginner who blunders, takes moves back, and doesn't know *why* a move is good or bad.

Stockfish can tell you that a move was bad. This app tries to tell you **why**, in plain sentences, and forces a "look before you move" habit. The coach layer is the product; everything else supports it.

`SPEC.md` is the source of truth for behaviour, architecture and phases. `AGENTS.md` has the working conventions.

## Status

**Phase 2 complete** — the app now explains why a move was bad, reviews the game afterwards, and remembers the positions you got wrong.

| Phase | Scope | State |
|---|---|---|
| 0 | Scaffold, Docker/CI pipeline, board renders, engine self-test | done |
| 1 | Board interaction, engine wrapper, opponent, Play mode, threats, settings, home | done |
| 1.5 | Casual game: plain chess with its own save, no coaching | done |
| 2 | Move classification, detectors, feedback, game review, mistakes deck, glossary | done |
| 3 | Puzzle import, Find the threat, Hanging pieces, Tactics, Endgames, Progress | next |
| 4 | Polish: haptics, animations, About, icon, performance pass | planned |

What you can do today:

- Play an untimed **practice game** against a level 1-10 opponent (adaptive by default).
- Play a **casual game** when you just want chess: same opponent and board, no questions, no coaching, and it never changes your level or stats.
- Tap a piece to see legal moves, then tap a destination to play it. No confirm step, no take-backs.
- Answer "What is the opponent threatening?" before each move in a practice game. The board highlights the real threats afterwards and your accuracy is saved.
- Get a short **feedback card** after an inaccuracy, mistake or blunder: the reason first, with a glossary link and more reasons behind a toggle. The card never names the engine's move; that stays in Review.
- Ask for up to three **hints** per practice game: a threat warning, the piece to look at, or the engine's move. Every hint is logged and flagged in Review.
- **Review** a finished practice game: average win% lost, inaccuracy/mistake/blunder counts, an eval graph, your worst moves, the played move in red and the best move in green on demand, plus hint and rushed-threat flags.
- Replay **Mistakes** from finished games in Learn. The deck uses 1/3/7/14-day spaced repetition and accepts only the best move.
- Read the four-question pre-move checklist, your threat-check accuracy and the **Glossary** under **Learn**.
- Change difficulty, touch-move, the threat-check mode and hints per game in Settings.
- Close the app mid-game and continue where you left off.

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

Releases are cut by tag: `git tag v0.4.1 && git push origin v0.4.1`. CI rebuilds, tests, and publishes the APK to GitHub Releases.

`build-apk.sh` runs entirely inside `capgo/capacitor:latest` (Node 24, JDK 21, Android SDK 36). CI calls the same script, so a local build and a CI build are the same build. The first run downloads Gradle and takes a while; the Gradle cache is reused after that.

Android is not a prerequisite: `npx cap add android` was run once and the generated project is committed. `npx cap sync android` re-copies web assets before a native build.

## Layout

```
src/coach/      pure functions: detectors, SEE, threats, tactics, classification (no DOM, no engine)
src/engine/     UCI client over a Web Worker, opponent move selection, cached analysis, eval maths
src/modes/      one module per game mode: play and review
src/ui/         React screens, board component, shared widgets
src/storage/    IndexedDB settings, progress, saved games, mistakes deck
src/data/       glossary, generated puzzles, theme text, endgame positions
tests/          mirrors src/coach, src/engine, src/modes and src/storage
scripts/        copy-stockfish.mjs (postinstall), prepare-puzzles.mjs (one-time, needs network),
                generate-icons.sh (launcher icons and splash screens, dev helper)
resources/      app icon SVG sources; generated Android mipmaps live in android/app/src/main/res
```

Rules that override everything else are in `SPEC.md` §2 — notably: a move is played the instant you tap a legal square, there are no take-backs anywhere, illegal taps are silently ignored, and the app never invents a coaching reason that no detector or engine result supports.

## Engine

Stockfish 19, lite single-threaded WASM build, run in a Web Worker. `scripts/copy-stockfish.mjs` copies it from `node_modules/stockfish/bin` to `public/stockfish/engine.js` + `engine.wasm`.

The two file names must stay in sync: the build looks for its wasm named after its own script (`engine.js` → `engine.wasm`) relative to the worker URL. Renaming one without the other produces a 404 and then a MIME-type error from `WebAssembly.instantiateStreaming`.

## Coach

`src/coach/` is pure and runs in a Web Worker for the pre-move threat check. In-game classification and Review use the same fixed analysis profile (depth 12, 600 ms cap) at every opponent level, so a move is judged the same way at level 1 and level 10. Review reuses the IndexedDB cache, so positions already seen in the game cost nothing.

- `classify.ts`: win% loss thresholds from SPEC 6.4 (`good` < 2, `ok` < 5, `inaccuracy` < 10, `mistake` < 20, else `blunder`).
- `detectors.ts` + `tactics.ts`: left-hanging, missed capture, allowed/missed mate, fork, pin, skewer, back rank, discovered attack.
- `feedback.ts`: the highest-severity finding leads and the rest sit behind a "More reasons" toggle. When nothing fires, the fallback states the size of the loss without naming the engine's move. The only in-game best-move reveal is hint level 3.
- `src/modes/review.ts`: one analysis per position, cached; builds the summary, eval graph, worst-move list and Mistakes-deck entries.

## Data

Fully offline after install. Puzzles come from the [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0), prepared once on a desktop with `scripts/prepare-puzzles.mjs` and committed as `src/data/puzzles.json`. The app itself never makes a network request.

## Licences

- **Stockfish** — GPL v3. The APK bundles it, so if this is ever distributed the source must be made available. Credited in the About screen.
- **Cburnett piece set** — CC BY-SA 3.0, see `public/pieces/cburnett/README.md`. The app icon is derived from the black knight in this set.
- **Lichess puzzle database** — CC0.
- **chess.js** — BSD-2-Clause.

## Development notes

- TypeScript `strict`, no `any`. Small files, one responsibility each.
- `src/coach/` is pure and tested with FEN fixtures, positive and negative per detector. Fixtures are verified with chess.js before they're trusted.
- Decisions, deviations from the spec, pinned versions and workarounds are recorded in `SPEC.md` §14.
