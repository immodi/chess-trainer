# AGENTS.md

Project: offline Android chess trainer (Capacitor + TypeScript + Stockfish WASM).

**Read `SPEC.md` first.** It is the source of truth for behavior, architecture, phases and acceptance criteria. Section 2 (non-negotiable behavior rules) overrides everything else.

## Commands
- `npm run dev`: browser dev server
- `npm test`: Vitest
- `npm run build`: production web build
- `./build-apk.sh`: build the debug APK in Docker (output: `dist-apk/chess-trainer-debug.apk`)

## Conventions
- TypeScript `strict`, no `any`. Small files, one responsibility each.
- `src/coach/` is pure (no DOM, no engine calls). Every detector gets a positive and a negative FEN fixture test. Verify fixtures with chess.js before trusting them.
- Never show coaching text that a detector or engine result doesn't back up.
- Don't add dependencies without a clear reason; note each one in the decisions log.
- Don't hand-edit `android/` except `AndroidManifest.xml` and Capacitor config. Run `npx cap sync android` after web builds.
- Work one phase at a time. At the end of each phase, run tests and the build, then report against that phase's checklist in `SPEC.md` section 10.
- Check Capacitor's current docs and `android/variables.gradle` for JDK, Node and SDK versions. Don't guess them from memory.
- Ask the user before changing the stack, the app id, or any rule in `SPEC.md` section 2. Log all other deviations in `SPEC.md` section 14.
