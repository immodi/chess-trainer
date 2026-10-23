# Chess Trainer: Build Spec

Audience: a coding agent (OpenCode). Read this whole file before writing code. Work phase by phase (section 10), stop at the end of each phase, and report against that phase's acceptance checklist.

---

## 1. Product summary

An offline Android app (Capacitor + TypeScript) that trains one specific person to stop blundering and to understand *why* moves are good or bad.

**The user:**
- Beginner. Lichess training mode leaves them lost.
- Cannot stop taking back moves.
- Does not know what makes a move good or bad, or what to look for.

**The product thesis:** Stockfish says *that* a move was bad. This app says *why*, in plain sentences, and forces a "look before you move" habit. The coach layer (section 6.5-6.6) is the core of the product. Everything else supports it.

**Modes:**
1. Play vs Stockfish (with coaching)
2. Find the threat
3. Hanging pieces
4. Tactics by pattern
5. Game review
6. Endgame drills
7. An offline List of puzzels, than can be refreshed online, but is fully avaliable offline

Plus a home screen with progress, a settings screen, and a "Checklist" reference card.

---

## 2. Non-negotiable behavior rules

These override anything else in this document if there is a conflict.

1. **No confirm step.** A move is played the instant the user taps a legal destination square. No confirm button, no delay.
2. **No take-backs, anywhere.** No undo button, no "retry that move" in Play mode. Mistakes are logged and explained afterward (review mode), never undone. (Retrying a *logged mistake position* later, as its own drill, is allowed because it is a fresh exercise.)
3. **Tapping an illegal square is ignored.** It never counts as a move and never shows an error.
4. **Legal destinations are shown as soon as a piece is selected** (dots on empty squares, rings on capturable pieces).
5. **Touch-move setting (default ON):** once the user selects a piece that has at least one legal move, they must move that piece. Tapping the same piece does not deselect it. Pieces with no legal moves cannot be selected (tap is ignored). When OFF, the user may deselect or reselect freely.
6. **Large tap targets:** squares at least 44 dp. Board fills the screen width in portrait.
7. **Threat check before each user move in Play mode** (section 6.6). Setting has three values: `always` (default), `whenThreatExists`, `off`. Note for the implementer: `whenThreatExists` leaks information (the prompt appearing means danger exists), which is why `always` is the default. In `always` mode a position with no threat is answered with one tap on "Nothing".
8. **Never show a coaching reason that no detector or engine result backs up.** If no detector fires, say so honestly (see 6.5 fallback).
9. **Fully offline** after install. No analytics, no accounts.
10. **Portrait only.**

---

## 3. Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript, `strict: true`, no `any` |
| Bundler | Vite, `base: './'` |
| UI | React |
| Rules | `chess.js` v1.x |
| Engine | `stockfish` npm package (nmrugg/stockfish.js), **lite, single-threaded WASM build**, run in a Web Worker |
| Mobile wrapper | Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`), plus `@capacitor/app` for the hardware back button |
| Storage | IndexedDB via `idb-keyval` or `idb` |
| Tests | Vitest |
| Piece graphics | Open-licensed SVG set (e.g. Cburnett). Verify the license and credit it in an About screen. |

**Version policy:** pin the latest stable Capacitor major at scaffold time. Read its docs and `android/variables.gradle` (`compileSdkVersion`, `targetSdkVersion`, `minSdkVersion`) and match the Docker image's JDK, Node and SDK platform to them. Do not guess these from memory. Record the chosen versions in the decisions log (section 14).

**Engine notes:**
- Do **not** use the multithreaded build. It needs `SharedArrayBuffer`, which needs COOP/COEP headers the Capacitor WebView does not provide.
- After `npm install stockfish`, inspect `node_modules/stockfish/` to find the actual lite single-threaded `.js` and `.wasm` file names (they include a version string). Copy both into `public/stockfish/` with a small script run on `postinstall`. Load with `new Worker('./stockfish/<file>.js')` and confirm the `.wasm` resolves next to it.
- If the WebView fails to load the `.wasm` (MIME type or path problems), first try `fetch` + manual instantiation, and as a last resort use the asm.js build. Record what you did.
- `setoption name Threads value 1`, `setoption name Hash value 16`.

---

## 4. Repo layout

```
chess-trainer/
├── AGENTS.md
├── SPEC.md
├── docker/
│   └── Dockerfile
├── build-apk.sh
├── capacitor.config.ts
├── package.json
├── vite.config.ts
├── scripts/
│   ├── copy-stockfish.mjs          # postinstall
│   └── prepare-puzzles.mjs         # one-time data prep (needs network)
├── public/
│   └── stockfish/                  # engine .js + .wasm
├── src/
│   ├── main.ts
│   ├── ui/
│   │   ├── board/                  # Board component + interaction state machine
│   │   ├── screens/                # Home, Play, Review, Settings, Progress, Checklist, About
│   │   └── components/             # prompts, feedback card, eval bar, sheets
│   ├── engine/
│   │   ├── uci.ts                  # worker wrapper, request queue
│   │   ├── opponent.ts             # move selection by level
│   │   └── evalUtils.ts            # cp/mate -> win%, normalization
│   ├── coach/                      # PURE functions, no DOM, fully unit-tested
│   │   ├── config.ts               # all tunable thresholds
│   │   ├── pieceValues.ts
│   │   ├── see.ts                  # static exchange / capture search
│   │   ├── threats.ts              # null-move threat computation
│   │   ├── hanging.ts
│   │   ├── classify.ts             # best/good/inaccuracy/mistake/blunder
│   │   ├── feedback.ts             # Findings -> plain-language text
│   │   └── detectors/
│   │       ├── index.ts
│   │       ├── leftHanging.ts
│   │       ├── missedCapture.ts
│   │       ├── mates.ts            # allowedMate, missedMate
│   │       ├── fork.ts
│   │       ├── pin.ts
│   │       ├── skewer.ts
│   │       ├── backRank.ts
│   │       └── discovered.ts
│   ├── modes/                      # one module per mode
│   │   ├── play.ts
│   │   ├── findThreat.ts
│   │   ├── hangingPieces.ts
│   │   ├── tactics.ts
│   │   ├── review.ts
│   │   └── endgames.ts
│   ├── data/
│   │   ├── puzzles.json            # generated, committed
│   │   ├── themes.ts               # theme names + "what to look for" text
│   │   └── endgames.ts
│   └── storage/
│       ├── db.ts
│       ├── settings.ts
│       └── progress.ts
├── tests/                          # mirrors src/coach and src/engine
└── android/                        # generated by Capacitor; edit only AndroidManifest + config
```

---

## 5. Architecture

- **UI** talks to **modes**. Modes talk to **engine** and **coach**. **Coach** is pure (FEN/moves in, data out) so it can be tested without a browser or engine.
- **Engine layer** exposes:
  ```ts
  analyze(fen: string, opts: { depth?: number; movetime?: number; multipv?: number }): Promise<EngineLine[]>
  stop(): void
  ```
  `EngineLine = { multipv: number; cp?: number; mate?: number; pv: string[]; depth: number }`. All scores are normalized to **White's perspective** in `evalUtils`. One search at a time through a queue. Cancel the current search with `stop` before starting a new one.
- **Eval → win%** (Lichess formula): `win = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)`. Mate scores map to cp = ±(10000 − |mate|). Always compute move quality in win% to avoid huge "losses" between two winning evaluations.
- **State persistence:** save the game state after every move so an Android process kill never loses a game. On launch, offer "Resume game".
- **Android back button:** via `@capacitor/app`. Inside a mode it returns to Home; mid-game it saves and returns to Home with a Resume option.

---

## 6. Detailed specs

### 6.1 Board component

- Props: FEN, orientation, interaction mode (`play` | `tapSquares` | `puzzle` | `readonly`), callbacks.
- Interaction state machine for `play`: `idle → pieceSelected → (move played | idle)`. Touch-move rules from section 2.
- Highlights: selected square, last move, legal destinations, check, and arrows (review/hints).
- Promotion: bottom sheet with Q/R/B/N. The sheet is mandatory (no default), and the user must pick.
- `tapSquares` mode (used by threat and hanging drills): tapping toggles a marker on a square (any square). No moves.
- Animate moves briefly (≤150 ms).

### 6.2 Engine wrapper (`uci.ts`)

- Speak UCI: `uci`, `isready`, `setoption name MultiPV value N`, `position fen <fen>`, `go depth D` or `go movetime M`.
- Parse `info depth … multipv K score cp|mate X … pv …`. Keep the last info per multipv index at the final depth. Resolve on `bestmove`.
- Convert scores from side-to-move to White's perspective using the FEN's active color.
- Handle `stop` cleanly (a stopped search still returns `bestmove`; discard it).
- Expose a ready promise. Show a "loading engine" state on first launch.

### 6.3 Opponent (`opponent.ts`)

Low-skill Stockfish (Skill Level / UCI_Elo) plays strong moves then randomly hangs its queen, which teaches nothing. Instead:

```
chooseMove(fen, level):
  lines = analyze(fen, { depth: D(level), multipv: 5 })
  best  = lines[0] win%
  keep lines whose win% loss vs best <= window(level)
  weight each by exp(-loss / T(level)); sample one
  return its first PV move
```

Level table (tunable in `coach/config.ts` or `engine/config`):

| Level | Depth | Window (win% pts) | T |
|---|---|---|---|
| 1 | 1 | 40 | 15 |
| 2 | 2 | 35 | 12 |
| 3 | 3 | 30 | 10 |
| 4 | 4 | 25 | 8 |
| 5 | 6 | 20 | 6 |
| 6 | 8 | 15 | 5 |
| 7 | 10 | 10 | 4 |
| 8 | 12 | 7 | 3 |
| 9 | 14 | 4 | 2 |
| 10 | 16 | 2 | 1 |

Also cap each search at `movetime` 1500 ms so slow phones stay responsive.

**Adaptive mode (default ON, starting level 2):** after each finished game, compute the user's blunders per 100 moves and the result. Win with < 3 blunders/100 → level + 1. Loss, or ≥ 8 blunders/100 → level − 1. Clamp 1–10. The user can also set a fixed level.

### 6.4 Move classification (`classify.ts`)

For each user move:
- `before` = best line eval for the mover in the position before the move.
- `after` = eval for the mover in the position after the move (from the next search).
- `loss = winBefore − winAfter` (win% points, clamp at ≥ 0).
- Labels (tunable): `best` (user's move = engine top-1), `good` (loss < 2), `ok` (< 5), `inaccuracy` (≥ 5), `mistake` (≥ 10), `blunder` (≥ 20).

**One search per position:** the search of position *i* gives the best eval for its side to move. The user's move leads to position *i+1*, whose search gives the eval for the other side. So `winAfter(mover) = 100 − win(next position's side to move)`. In Play mode the opponent's reply search doubles as the "after" evaluation. In Review, run one search per ply and reuse results. Cache results in IndexedDB by `fen+depth`.

### 6.5 Coach: detectors and feedback

**Piece values:** P1 N3 B3 R5 Q9. King is never "captured"; handle checks separately.

**`see.ts` — capture search.** `see(fen, square): number` returns the net material the side to move wins by starting a capture sequence on `square` (0 if it prefers not to capture). Implement as a small negamax over *legal* captures on that square only, always capturing with the least valuable attacker first, with a stand-pat option, depth-limited to ~8 plies. Using legal moves means pins and x-rays are handled correctly for free.

**`hanging.ts`:** a non-king piece is **hanging** for its owner if the opponent, to move, has `see > 0` on its square. Compute for both colors by flipping the active color in the FEN (clear the en-passant field). If flipping produces an invalid position because the side "passing" is giving check, return `undefined` (see 6.6).

**Detector interface:**
```ts
interface Finding {
  kind: FindingKind;
  severity: number;           // higher = more important, used to pick what to say
  squares: Square[];          // for highlighting
  text: string;               // plain language, <= 2 sentences
}
type Detector = (ctx: DetectCtx) => Finding[];
// DetectCtx: fenBefore, fenAfter, playedMove, bestMove (if known), bestPv, evalBefore, evalAfter, mover
```

**Phase-2 detectors** (each with unit tests; see section 11):

| Detector | Fires when |
|---|---|
| `leftHanging` | After the move, one of the mover's pieces has `see > 0` for the opponent. Distinguish *moved into attack* (the moved piece), *removed a defender* (another piece), and *ignored an existing threat* (it was already hanging before the move and still is). |
| `missedCapture` | Before the move, the mover had a capture with `see > 0` and did not play it, and the engine's best move wins material. |
| `allowedMate` | After the move, the opponent has a legal mate-in-1. |
| `missedMate` | Before the move, the mover had a mate-in-1 and did not play it. |
| `fork` | A move (either side's best reply, or the user's missed best move) lands a piece that attacks ≥ 2 targets, each undefended or worth more than the forker (a check counts as one target), and the forker cannot be captured at a net loss. Used for "you missed a fork" and "you allowed a fork". |
| `pin` | A slider's ray hits a piece with a more valuable piece (or the king) directly behind it. Distinguish absolute (king) and relative pins. |
| `skewer` | A slider attacks a valuable piece with a lesser-or-equal piece behind it on the same ray, so moving the front piece loses the rear one. |
| `backRank` | The king sits on its back rank with its own pawns blocking all escape squares (no luft) and an enemy rook or queen can reach the back rank. Warning form ("your back rank is weak") and mate form. |
| `discovered` | Moving a piece uncovers a slider's attack on a valuable target. |

**Fallback when nothing fires:** write something like "The engine preferred **Nf3** here. After your move the position is about 1.2 pawns worse for you, but I can't point to a single clear reason." Then show the engine's principal variation (first 4 plies) so the user can still see the line. Never invent a reason.

**Feedback text rules (`feedback.ts`):**
- Concrete: name the piece and square. Example: "Your bishop on **c4** can be captured for free by the knight on **d6**. Nothing defends it."
- At most 2 sentences. No unexplained jargon. The first time a term appears (fork, pin, skewer, hanging, luft, back rank), include a short inline definition and link to the Glossary.
- Tone: direct and encouraging. No sarcasm, no "obviously".
- Pick the highest-severity finding to lead; list others behind a "More" toggle.
- Don't reveal the best move by default. Show the reason first, then a "Show better move" button.

**The checklist** (an always-available card and the default pre-move overlay in Learning mode):
1. Is anything of mine hanging or under-defended?
2. Is anything of theirs hanging?
3. What are all their checks, captures and threats?
4. What did their last move threaten?

### 6.6 Threats (`threats.ts`)

`computeThreats(fen): Threat[] | undefined`
- Take the position with the user to move. If the user is in check, return `undefined` (no threat prompt; they must answer the check).
- Build the **null-move position**: flip the active color, clear en-passant. Generate the opponent's legal moves there.
- Threat types for Phase 1: (a) captures with `see > 0` (target = captured piece's square), (b) mate-in-1 (target = the user's king square and the mating move's destination).
- Phase 2/3 additions: fork threats and pin/skewer threats reusing the detectors.
- Sort by material at stake.

**Prompt UI in Play mode** (before each user move, per the setting):
- Banner: "What is the opponent threatening?" Board switches to `tapSquares` for the user's pieces and squares. Buttons: **Nothing** and **Done**.
- Correct if the selection includes every threatened target and at most one extra square; "Nothing" is correct only when no threats exist.
- After the answer, reveal the real threats briefly (green/red squares for ~1.5 s) and unlock the board. A wrong answer never blocks moving. It is logged (accuracy shows on Progress).
- Log the response time. If the user moves in under 2 s while a threat existed, mention it gently in Review.

### 6.7 Modes

**Mode 1: Practice game**
- Choose color (white / black / random). Untimed. Opponent per 6.3.
- Threat check per setting, touch-move per setting, no confirm, no undo.
- After the opponent's reply, show a non-blocking feedback card if the user's last move was `inaccuracy` or worse (reason first, "Show better move" second). Dismissible.
- **Hints** (max 3 per game, each logged and flagged in Review): level 1 tells whether a threat exists, level 2 highlights the piece/square to look at, level 3 shows the engine's best move.
- Resign button. Game end: checkmate, stalemate, repetition, 50-move rule, insufficient material.
- On game end, offer Review.

**Mode 1b: Casual game**
- Plain chess, for when the user just wants to play. Same board and opponent as Mode 1: color choice, untimed, levels 1–10 or the current adaptive level, touch-move setting, legal-move dots, promotion sheet, resign, game end, save/resume.
- **No practice features at all:** no threat prompt, no feedback card, no hints, no review, no Mistakes deck, no glossary links, no threat-answer logging.
- Does not change the adaptive level and does not count toward Progress. An adaptive setting uses the stored `adaptiveLevel` as a fixed level for that game.
- Has its **own save slot**, independent of the practice save. Starting or finishing one mode never overwrites the other.
- Home offers both modes, each with its own Continue action. Casual games are labelled as such in the game header.

**Mode 2: Find the threat**
- Position with the user to move. Same tap-squares UI as 6.6. Ground truth from `computeThreats`. About 25% of positions have no threat.
- Sources: puzzle FENs (after the opening move is applied), plus positions from the user's own games where they failed the threat check (served again first).
- Show a one-sentence explanation after each answer. Track accuracy over time.

**Mode 3: Hanging pieces**
- Position shown. The user taps **every hanging piece, both colors**, then Done. Ground truth from `hanging.ts`. Include positions with 0–3 hanging pieces.
- Scoring: correct set = full credit; missing or extra squares are highlighted in the reveal.

**Mode 4: Tactics by pattern**
- Puzzles from `data/puzzles.json`, filtered by theme. Flow: show the position, apply the opponent's first move, then the user plays the solution moves. A wrong move ends the puzzle (no retry), shows the solution, and re-queues it for later. A different move that delivers checkmate counts as correct.
- **Learn vs Test toggle:** Learn shows the theme name and its "what to look for" text before the puzzle. Test hides the theme until solved.
- On solve, name the pattern(s) and show the theme's "what to look for" text.
- Difficulty adapts: start in a 600–900 rating band, and move the band up when the recent success rate is ≥ 80%, down when ≤ 50%.

**Mode 5: Game review**
- Runs after a game (or on any saved game). One engine search per ply (about 250–300 ms each) with a progress bar. Cache.
- Shows: accuracy summary (average win% lost per move), counts of inaccuracies/mistakes/blunders, an eval graph, and a list of the user's worst moves, blunders first.
- Tapping a mistake jumps to the position before it, with the played move (red arrow), the best move (green arrow, hidden until revealed), and the 6.5 explanation.
- Hinted moves and slow/fast threat-check responses are annotated.
- Each mistake of `mistake` or worse is added to the **Mistakes deck**, a Leitner-style deck (intervals 1, 3, 7, 14 days). The user can replay these positions as puzzles from the Home screen.

**Mode 6: Endgame drills**
- Fixed starting FENs in `data/endgames.ts`, played against full-strength Stockfish. Each drill has a goal (win or hold the draw), a short text hint, and a move budget (e.g. checkmate within 50 moves for KQ vs K).
- Initial set: K+Q vs K, K+R vs K, K+P vs K (win and draw positions, opposition), and a few basic rook-endgame positions.
- Determine each drill's expected result with Stockfish when preparing the data, and store it. **Every FEN must be validated in a test:** it loads in chess.js, is not game-over, and the stated goal matches the engine's result.

### 6.8 Progress

Home screen shows: current opponent level, blunders per 100 moves (last 10 games), threat-check accuracy, hanging-piece accuracy, per-theme tactics success, and the number of Mistakes-deck positions due today. Keep it as simple numbers and small trend lines (no chart library unless needed).

### 6.9 Settings

Opponent level (adaptive / fixed 1–10); touch-move (default on); threat check (`always` | `whenThreatExists` | `off`, default `always`); hints per game (0–3, default 3); tactics Learn/Test; show eval bar in Play (default off); board orientation and theme; haptics (optional).

Touch-move and the board options apply to both game modes. Threat check and hints apply to the **practice game only**; a casual game ignores them.

---

## 7. Data

### 7.1 Puzzles (`scripts/prepare-puzzles.mjs`)

Source: `https://database.lichess.org/lichess_db_puzzle.csv.zst` (CC0 license). The script runs on the user's machine (it needs network) and writes `src/data/puzzles.json`, which is committed so the app and Docker build never need network.

- CSV columns: `PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags`.
- `FEN` is the position **before** the opponent's first move. `Moves` is a space-separated list of UCI moves: the first is the opponent's move (applied automatically), the rest alternate user/opponent starting with the user's solution move.
- Decompress with the system `zstd` (`zstd -dc`) or a small Node zstd package, streaming line by line.
- Filter: `Rating` 600–1800, `RatingDeviation` < 100, `Popularity` ≥ 80, `NbPlays` ≥ 500.
- Themes to keep: `hangingPiece, fork, pin, skewer, backRankMate, discoveredAttack, mateIn1, mateIn2, trappedPiece, deflection, attraction, capturingDefender`.
- Keep up to ~1,500 puzzles per theme, spread evenly across the rating range. A puzzle may carry multiple themes. Store compactly: `{id, fen, moves, rating, themes}`.
- If the download isn't possible, the script should print clear manual instructions (download the file, pass its path as an argument).

### 7.2 Theme text (`data/themes.ts`)

One entry per theme: `{ id, name, lookFor }`. Starter `lookFor` texts (refine as needed):

- **hangingPiece:** A piece that can be captured for free. Before every move, scan both sides: which pieces are undefended, or attacked by something worth less?
- **fork:** One piece attacks two valuable things at once. Knights are the classic forkers. Look for a square where your piece would attack two or more undefended or higher-value pieces.
- **pin:** A piece can't (or shouldn't) move because something more valuable sits behind it on the same line. Look for bishops, rooks and queens aiming along a line at a piece with the king or queen behind it.
- **skewer:** A pin in reverse: a valuable piece is attacked, must move, and exposes the piece behind it. Look for checks or attacks on a king or queen with something loose behind it.
- **backRankMate:** The king is trapped on its back rank by its own pawns and a rook or queen gives check along the rank. Check whether your own king has an escape square, and look for enemy kings that don't.
- **discoveredAttack:** Moving one piece uncovers an attack from the piece behind it. The moving piece can make its own threat at the same time.
- **mateIn1 / mateIn2:** List every check first. A check where the king has no escape, no block and no capture is mate.
- **trappedPiece:** An attacked piece with no safe square to go to. Count the safe retreats of an enemy piece that has wandered far.
- **deflection:** Force a defender away from its job (guarding a piece or a mating square), then take what it was guarding.
- **attraction:** Lure an enemy piece, often the king, onto a bad square, usually with a sacrifice, so you can attack it.
- **capturingDefender:** Capture the piece that defends your real target, then take the target.

---

## 8. Build and run

**Dev:** `npm run dev` (browser, mobile emulation). Stockfish runs in the dev server too.

**APK via Docker (no Android Studio):**

`docker/Dockerfile`:
```dockerfile
ARG JDK_VERSION=21
FROM eclipse-temurin:${JDK_VERSION}-jdk-jammy

ARG NODE_MAJOR=20
ARG CMDLINE_TOOLS=11076708        # update to the current number from developer.android.com
ARG ANDROID_PLATFORM=35           # match compileSdkVersion in android/variables.gradle
ARG BUILD_TOOLS=35.0.0

ENV ANDROID_HOME=/opt/android-sdk
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

RUN apt-get update && apt-get install -y curl unzip git \
 && curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
 && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

RUN mkdir -p $ANDROID_HOME/cmdline-tools \
 && curl -o /tmp/t.zip https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip \
 && unzip /tmp/t.zip -d $ANDROID_HOME/cmdline-tools \
 && mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest \
 && rm /tmp/t.zip

RUN yes | sdkmanager --licenses \
 && sdkmanager "platform-tools" "platforms;android-${ANDROID_PLATFORM}" "build-tools;${BUILD_TOOLS}"

WORKDIR /app
```

`build-apk.sh` (bash; works on Linux, macOS, WSL2):
```bash
#!/usr/bin/env bash
set -euo pipefail
IMAGE=chess-trainer-android
docker build -t "$IMAGE" -f docker/Dockerfile docker
docker run --rm \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -v "$PWD":/app \
  -v chess-trainer-gradle:/root/.gradle \
  -v chess-trainer-node-modules:/app/node_modules \
  "$IMAGE" sh -c "npm ci && npm run build && npx cap sync android && cd android && ./gradlew assembleDebug \
    && chown -R \$HOST_UID:\$HOST_GID /app/android /app/dist"
mkdir -p dist-apk
cp android/app/build/outputs/apk/debug/app-debug.apk dist-apk/chess-trainer-debug.apk
echo "APK: dist-apk/chess-trainer-debug.apk"
```

Notes: on Apple Silicon add `--platform linux/amd64` to the `docker build` and `docker run` calls. On Windows use WSL2 and keep the project inside the WSL filesystem. The debug APK needs no signing setup. Install by copying it to the phone and allowing "install unknown apps", or `adb install -r dist-apk/chess-trainer-debug.apk`. Debug the WebView with `chrome://inspect` over USB.

---

## 9. Android specifics

- `capacitor.config.ts`: `appId: 'com.example.chesstrainer'` (ask the user whether they want a different id), `appName: 'Chess Trainer'`, `webDir: 'dist'`.
- Lock portrait in `AndroidManifest.xml` (`android:screenOrientation="portrait"` on the main activity).
- Set status bar and splash colors to match the theme. Adaptive icon: simple placeholder, fine for now.
- The app needs no network. Leave the INTERNET permission only if Capacitor requires it for the dev server in debug.

---

## 10. Phases and acceptance criteria

Finish and report on each phase before starting the next. At the end of every phase: `npm test` passes, `npm run build` passes, and `./build-apk.sh` produces an installable APK.

### Phase 0: Scaffold and pipeline
- [ ] Vite + TS + Capacitor project created; Android platform added; versions pinned and recorded.
- [ ] Dockerfile and `build-apk.sh` work; APK installs on a phone.
- [ ] A static board renders full-width in portrait on the device.
- [ ] Stockfish worker loads **on the device** and answers `isready` and a `go depth 8` (show the result on screen temporarily). This de-risks the biggest unknown early.

### Phase 1: Core loop
- [x] Board interaction per section 2 (no confirm, no undo, ignore illegal taps, legal-move dots, touch-move setting, promotion sheet).
- [x] Engine wrapper with queue, MultiPV, win% normalization (unit-tested with canned UCI output).
- [x] Opponent per 6.3 with levels 1–10 and adaptive adjustment stub.
- [x] Play mode: color choice, game-end detection, resign, save/resume after every move.
- [x] `see.ts`, `hanging.ts`, `threats.ts` with tests; threat-check prompt with all three settings; response logged.
- [x] Settings screen; Home screen with Play and Checklist.

### Phase 1.5: Casual game
- [x] Home offers **Practice** and **Casual** games, each with its own Continue action.
- [x] Casual uses the same board, opponent levels, touch-move, promotion, resign and game end.
- [x] Casual shows no threat prompt, feedback, hints or review, and logs no threat answers.
- [x] Casual does not change the adaptive level or Progress.
- [x] Practice and casual saves are separate; resuming or finishing one never touches the other.
- [x] Tests cover the mode on `newGame`/`fromSaved`; `npm test` and `npm run build` pass.

### Phase 2: The coach
- [x] `classify.ts` and one-search-per-position evaluation in Play mode.
- [x] All Phase-2 detectors in 6.5 with tests; `feedback.ts` with the fallback rule.
- [x] In-game feedback card (reason first; the better move is shown in Review, see §14); hints with logging.
- [x] Game review mode with caching, summary, mistake list, arrows.
- [x] Mistakes deck stored; replayable from Learn (see §14).
- [x] Glossary screen.

### Phase 3: Drills and progress
- [x] `prepare-puzzles.mjs` run; `puzzles.json` committed and under ~8 MB.
- [x] Find the threat, Hanging pieces, Tactics (Learn/Test, adaptive band, re-queue on fail), Endgame drills.
- [x] Progress screen with the numbers in 6.8.
- [x] Threat computation extended with fork/pin/skewer threats.

### Phase 4: Polish
- [ ] Haptics, sounds (optional), animations, empty/error states, About screen with licenses, app icon.
- [ ] Performance pass on a mid-range phone (review of an 80-ply game should finish in under ~40 s).

---

## 11. Testing requirements

The coach layer is the highest-risk code. It must be tested with FEN fixtures. **Verify every fixture with chess.js (legal, side-to-move correct) and, where an engine evaluation is claimed, with Stockfish before relying on it.**

Required test groups:
- `see`: undefended piece (positive), defended by a lesser piece (non-positive), x-ray battery, pinned recapturer.
- `hanging` / `threats`: none, one, multiple, in-check returns `undefined`, null-move FEN handles en passant.
- `mates`: mate-in-1 found/not found. Example fixture: `6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1` (Ra8# is mate).
- One positive and one negative fixture per detector (`fork`, `pin`, `skewer`, `backRank`, `discovered`, `leftHanging` in each of its three forms, `missedCapture`).
- `classify` thresholds and mate-score clamping (a move from +mate to +9 pawns must not be a blunder).
- `uci` parser against recorded engine output, including `mate` scores and multiple PV lines.
- `puzzles.json` schema check, and every endgame FEN validated as described in 6.7.

---

## 12. Risks and known gotchas

- **WASM in the Capacitor WebView:** path and MIME problems are the likeliest Phase-0 failure. Test on a real device early.
- **Engine speed on phones:** lite WASM at depth 12–14 can take 1–2 s. Use `movetime` caps and background-cache analysis. Never block the UI thread.
- **chess.js API differences between 1.x releases:** if a helper such as `attackers` is missing or behaves differently, write the attack utilities yourself instead of depending on it.
- **Null-move FENs:** flipping the active color can make chess.js reject the position when the passing side gives check. Handle it explicitly (6.6).
- **Gradle/JDK/SDK mismatches** are the usual Docker build failure. Read the actual error and match versions to the scaffolded Capacitor version.
- **Root-owned files on Linux** after Docker builds: handled by the `chown` in `build-apk.sh`.
- **Storage clearing:** Android can evict WebView storage in extreme cases. Keep stores small and recoverable.

## 13. Licenses

- **Stockfish is GPL v3.** Fine for a personal APK. If the app is ever distributed, the source must be made available. Credit Stockfish in About.
- **Lichess puzzle database:** CC0.
- **Piece SVGs:** verify the license of the chosen set and credit it in About.
- `chess.js`: BSD-2-Clause.

---

## 14. Decisions log (agent: append here)

Record every deviation from this spec, every version you pinned, and every workaround (engine loading, WebView quirks). Format: `YYYY-MM-DD: decision, reason`.

- 2026-10-23: Pinned Capacitor 8.5.3 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`) and `@capacitor/app` 8.1.2, the current stable major. Capacitor 8 requires Node 22+, Android Studio 2025.2.1+, `minSdkVersion 24`, `compileSdkVersion`/`targetSdkVersion` 36, AGP 8.13.0, Gradle 8.14.3 (from the Capacitor 8 upgrade guide, not from memory). Docker base is therefore JDK 21 (what AGP 8.13/Android Studio ship) on Node 22, with `platforms;android-36`, `build-tools;36.0.0` and cmdline-tools 15859902.
- 2026-10-23: Removed the inline `#` comments from the Dockerfile `ARG` lines in SPEC 8. Docker treats the comment as part of the value, so `CMDLINE_TOOLS` became `11076708        # update ...` and the SDK download URL 404'd. Comments now sit on their own lines.
- 2026-10-23: App id is `com.chess.chesstrainer` (user decision; replaces the `com.example.chesstrainer` placeholder in SPEC 9).
- 2026-10-23: Mode 7 ("offline puzzle list that can be refreshed online") is satisfied by `scripts/prepare-puzzles.mjs` on the user's desktop plus a committed `puzzles.json`. The app itself never touches the network, which keeps SPEC 2.9 ("fully offline after install") intact.
- 2026-10-23: **Deviation from SPEC 2.6.** The board keeps the app's normal padding; the user explicitly rejected a zero-padding board. On a 360 dp-wide phone squares come out at ~43 dp rather than 44 dp. Every wider device still clears 44 dp.
- 2026-10-23: **Deviation from SPEC 6.5.** In-game feedback never reveals the best move: the feedback card has no "Show better move" button in Play mode, and the fallback text does not name the engine's move. The only in-game reveal is hint level 3 (max 3 per game, flagged in Review). Reason: the user wants to learn the reasoning, not the answer; review mode still shows best moves after the game.
- 2026-10-23: Move classification will use a fixed analysis profile (same depth/time for every level) instead of reusing the opponent's search, deviating from SPEC 6.4's "the opponent's reply search doubles as the after evaluation". At level 1 that eval comes from a depth-1 search, which would make the coach call identical play "blunder" at level 1 and "good" at level 10.
- 2026-10-23: Coach functions stay pure (SPEC 5) but run inside a dedicated Web Worker so `see`/`hanging`/`threats` never block the UI thread before a user move.
- 2026-10-23: The agent does not generate `android/`, does not run `npx cap sync`, and does not build the APK; those stay manual (user decision). Phase acceptance is reported against the web build, with device items left open for the user to confirm.
- 2026-10-23: Engine is the `stockfish` npm package 19.0.1, build `stockfish-19-lite-single` (lite, single-threaded, 1.8 MB wasm). `scripts/copy-stockfish.mjs` copies it to `public/stockfish/engine.js` + `public/stockfish/engine.wasm`.
- 2026-10-23: Workaround for engine loading: the build resolves its wasm as *its own script basename* + `.wasm` (`engine.js` -> `engine.wasm`), relative to the worker URL. An earlier attempt that copied the wasm to `stockfish.wasm` failed with a 404 and then "Incorrect response MIME type. Expected 'application/wasm'". Keep both file names in sync and do not rename one without the other. Verified in Chromium against both `vite` and `vite preview`.
- 2026-10-23: TypeScript pinned to 5.9.3 rather than the 7.0.2 `latest` (native compiler), to avoid tooling churn in Vite/Vitest/React types on a greenfield project. Revisit once the ecosystem standardises.
- 2026-10-23: `idb-keyval` 6.3.0 is installed now but unused until Phase 1; it is the storage choice from SPEC 3.
- 2026-10-23: Piece graphics are Cburnett SVGs taken from the Lichess repository, CC BY-SA 3.0; credited in `public/pieces/cburnett/README.md` and destined for the About screen.
- 2026-10-23: The `android/` platform is now generated with `npx cap add android` (Capacitor 8.5.3). `variables.gradle` confirms `minSdkVersion 24`, `compileSdkVersion 36`, `targetSdkVersion 36`, AGP 8.13.0, Gradle 8.14.3. Only `AndroidManifest.xml` was hand-edited (portrait lock).
- 2026-10-23: APK builds use the `capgo/capacitor:latest` Docker image (user decision) instead of the hand-rolled `docker/Dockerfile`, which is deleted to avoid two drifting build paths. The image ships Node 24.22, JDK 21.0.9, Android platforms 34/35/36 and build-tools 34/35/36, which covers Capacitor 8's requirements. `build-apk.sh` is the single build entry point and is called by CI (`.github/workflows/android.yml`) and by hand, so both paths are identical.
- 2026-10-23: CI runs `npm ci`/typecheck/test/build on Node 22 (fast job) and then the APK job in the capgo image, uploading `chess-trainer-debug-apk`. Gradle's user home is redirected into `.gradle-cache` (gitignored) so `actions/cache` keeps the 8.14.3 distribution and dependencies between runs; the first cold build takes ~15 minutes, warm ones much less.
- 2026-10-23: Releases are published by CI on a `v*` tag push (`.github/workflows/android.yml`, `release` job, `contents: write`), using the runner's `GITHUB_TOKEN`. This avoids storing a personal access token on the development machine and makes "build this tag and ship it" a single `git push origin vX.Y.Z`.
- 2026-10-23: The INTERNET permission is left in the generated manifest. No app code uses the network; the permission is only needed for Capacitor's debug live-reload server, and removing it would break that workflow.

- 2026-10-23: **Board layout workaround.** On the phone, rows containing the kings were twice as tall: `wK.svg`/`bK.svg` were the only pieces without an intrinsic `width`/`height`, and the WebView sized grid rows from image content instead of resolving `1fr` + `aspect-ratio`. Fixed in three layers: both king SVGs got `width="45" height="45"`, the board now sits in a `padding-bottom: 100%` frame so its height is definite without `aspect-ratio`, and pieces are absolutely positioned so they can never affect layout. Verified: 8 equal rows (spread 0 px) and a square frame at 390x844.
- 2026-10-23: Verification caught a second board bug: empty squares had no identity because the square name came from the occupied cell (`cell?.square`), so `e3`/`e4` could not be tapped. Squares are now generated from the orientation, and pieces are looked up with `chess.get(square)`. This is why the browser check taps real squares end to end rather than only counting pieces.
- 2026-10-23: Opponent searches send `go depth D movetime 1500` (both caps) instead of one or the other, so a slow phone stops on time and a fast one stops on depth.
- 2026-10-23: **Adaptive stub (Phase 1).** Until `classify.ts` exists, `blundersPer100` is treated as 0: a win promotes, a loss demotes, a draw holds, clamped 1-10. The adaptive level is persisted in `progress.adaptiveLevel` and seeds the next game.
- 2026-10-23: Threat checks run in a module Web Worker (`src/coach/worker.ts` via `client.ts`) with a synchronous fallback if worker construction fails, so an old WebView degrades instead of breaking. The prompt locks the board until the answer is given (SPEC 6.6), and the reveal highlights stay for 1.5 s without blocking the next move.
- 2026-10-23: `settings.hintsPerGame` is stored but not shown in Settings yet, because hints themselves are Phase 2. No dead controls in the UI.
- 2026-10-23: The Phase 0 self-test screen is gone; the app now opens on Home (Play, Checklist, Settings). The depth-8 panel was developer tooling and the user found it confusing.

- 2026-10-23: Added **Mode 1b: Casual game** as Phase 1.5 (user request: sometimes they just want to play chess). It reuses the Mode 1 board and opponent but skips every practice feature (threat prompt, feedback, hints, review, mistake deck) and never changes the adaptive level or Progress. It gets its own IndexedDB save slot so a casual game cannot overwrite a practice game; the legacy `current-game` key is migrated to the practice slot on first load.
- 2026-10-24: Phase 2 complete. `classify.ts` uses the SPEC 6.4 thresholds; in-game classification and Review both use the fixed `ANALYSIS` profile (depth 12, movetime 600 ms), and Review reuses the IndexedDB `analysis:` cache. This is the fixed-profile deviation recorded on 2026-10-23; the 600 ms cap is longer than Mode 5's "about 250-300 ms" so in-game and review calls stay identical and cacheable.
- 2026-10-24: Phase 2 feedback follows the 2026-10-23 no-best-move decision: the card has no "Show better move" button and the fallback names neither the best move nor the PV. The missed-capture/fork/discovered reasons describe the piece and target without giving the engine's SAN; allowed-mate still names the opponent's mating move because the game is already lost. Review shows the best move on demand.
- 2026-10-24: Mistakes deck is a four-box Leitner deck with 1/3/7/14-day intervals. Only `mistake`/`blunder` moves from Review enter it; a repeated position+move restarts at box 1, and replay accepts only the exact stored best move (a wrong move resets to box 1). New cards are due the next day, so the Learn counter is 0 on the day they are added.
- 2026-10-24: **Deviation from SPEC 6.7 Mode 5 / 6.8.** The user asked for Home to keep only Practice, Casual, Learn and Settings. The checklist, threat-check stats, Mistakes deck and Glossary now live under Learn; Home no longer shows the stats. The Mistakes deck is therefore replayable from Learn, not directly from Home.
- 2026-10-24: **Deviation from SPEC 6.7 Mode 5.** Review is offered after a finished practice game only. Reviewing an in-progress saved game is deferred; the saved game has no per-move classifications, and analyzing a partial game would duplicate the eventual review.
- 2026-10-24: Review annotates hinted moves from `GameState.hints` and rushed threat answers by matching the last 50 `Progress.recentThreatChecks` entries by FEN. Per-game threat checks are not stored in the save, so a repeated FEN or a game with more than 50 checks can mis-annotate. The annotation is advisory.
- 2026-10-24: Adaptive `blundersPer100` counts the user moves classified in the current Play session. A resumed game only counts moves after the resume, because the save stores SAN history but not earlier classifications. The result and blunder count still update Progress once per finished game.
- 2026-10-24: Hints per game (0-3) is now exposed in Settings; the 2026-10-23 note that it was hidden no longer applies. Each hint is saved with the game (`hints`) and flagged in Review. Level 3 is the only in-game best-move reveal.
- 2026-10-24: `CLASSIFY` is `{good: 2, ok: 5, mistake: 10, blunder: 20}`. The earlier placeholder values did not match SPEC 6.4's thresholds; this is the implementation used by the tests.
- 2026-10-24: The feedback card waits for the threat reveal to finish before appearing, so it does not cover the pre-move question. It remains dismissible and non-blocking once shown.
- 2026-10-24: Phase 2 verification used Chromium against `vite preview` at 390x844: Home/Learn routes, all three hint levels, an inaccuracy feedback card after 1.f3, Review with eval graph and arrows, and a casual game with none of those features. The browser probe is `/tmp/opencode/verify/phase2.mjs` (not committed).
- 2026-10-24: App icon is the Cburnett black knight on a cream `#F0D9B5` field, reusing the board piece set (CC BY-SA 3.0, see `public/pieces/cburnett/README.md`). Source SVGs live in `resources/`; `scripts/generate-icons.sh` regenerates the Android mipmaps. The default Capacitor icon and splash images were replaced; the splash uses the dark app background with the square icon. This takes the icon item from Phase 4 early (user request).
- 2026-10-24: Phase 3 puzzle data was generated from the Lichess puzzle database with `scripts/prepare-puzzles.mjs`: rating 600–1800, rating deviation < 100, popularity ≥ 80, plays ≥ 500, 12 rating bins of 100 points, and up to 125 puzzles per bin per theme (1,500 per theme). The result is 17,240 unique puzzles in `src/data/puzzles.json` (2.43 MB, under the 8 MB budget). A puzzle keeps every selected theme it carries, so per-theme counts are not exclusive.
- 2026-10-24: A full solution replay of all 17,240 puzzles was run once while preparing the data and passed. `tests/data/puzzles.test.ts` validates every row's schema and FEN and replays every 30th solution with `preparePuzzle`; replaying all 17k solutions made the unit suite take ~23 s, so the committed test uses a broad sample. `prepare-puzzles.mjs` prints manual download instructions when the database cannot be fetched.
- 2026-10-24: **Endgame validation workaround.** The endgame FENs and goals were checked with native Stockfish 19 at depth 18 (KQvK mate 6, KRvK +709, KPvK win +702, rook-pawn draw 0, R+P draw +4, R+P win +401). The Node `stockfish` 19.0.1 WASM package crashes under Node v24.18.0 with `RuntimeError: unreachable`, so the stored `engine` result is committed with each drill and `tests/data/endgames.test.ts` checks that every FEN is legal, unfinished, and that its stored score supports the goal. A live engine replay is not part of `npm test`; re-run the native binary if the data changes.
- 2026-10-24: Endgame drills use full-strength Stockfish with a fixed `ENDGAME` profile (depth 18, 1,200 ms cap) and no level sampling. The move budget counts full moves; for a draw drill, reaching the budget without losing counts as success, while a win drill must actually mate.
- 2026-10-24: Tactics Learn/Test is stored as `settings.tacticsMode` (default `learn`). Learn shows the theme name and `lookFor` text before the puzzle; Test hides them until the answer. A failed puzzle is re-queued after at least one fresh puzzle in the same session; the queue is not persisted.
- 2026-10-24: Find-the-threat sessions start with failed in-game threat checks, then add puzzle positions after applying the opponent's first move. About a quarter of the session is reserved for positions with no threats so "Nothing" remains a real answer. Hanging-piece sessions use the same prepared puzzle positions and keep only positions with 0–3 hanging pieces. Both drills use the coach worker and record separate Progress counters.
- 2026-10-24: Phase 3 keeps the Home screen at Practice, Casual, Learn and Settings. Drills, Progress, Mistakes, Checklist and Glossary all live under Learn, extending the Phase 2 navigation decision.
- 2026-10-24: Phase 3 verification used Chromium at 390x844 against `vite preview`: Learn, Progress, the tactics theme picker and a puzzle, an endgame with a full-strength reply, and both drill answer/reveal flows. The probe is `/tmp/opencode/verify/phase3-interact.mjs` (not committed); it reported no page or console errors.
