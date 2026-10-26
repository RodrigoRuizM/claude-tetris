# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris on HTML5 Canvas. No dependencies, no `package.json`, no build step, no test suite, no linter. UI text and the README are in Spanish; keep user-facing strings in Spanish.

## Running

Serve the folder statically and open `http://localhost:8000`:

```bash
python3 -m http.server 8000   # or: npx serve .
```

Opening `index.html` directly in a browser also works. Verify changes manually in the browser.

## Architecture

Three files: `index.html` (DOM + two canvases + overlay), `style.css` (dark theme), and `game.js`, which holds all logic as top-level functions sharing module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, …). `game.js` grabs DOM elements by id at load time, so renaming ids in `index.html` requires matching changes in `game.js`.

Key conventions in `game.js`:

- **Board** is a `ROWS × COLS` matrix; each cell is `0` (empty) or a piece type index `1–7`. The same index is used in piece shapes and as the lookup into `COLORS` — piece type, shape cell value and color index must stay aligned across `PIECES` and `COLORS` (index 0 is `null` in both).
- **Pieces** are square matrices; rotation is `rotateCW` (transpose + reverse), with simple horizontal wall kicks `[0, -1, 1, -2, 2]` in `tryRotate`. `collide(shape, x, y)` is the single collision check used by movement, rotation, gravity, ghost projection and spawn.
- **Piece lifecycle**: `lockPiece()` → `merge()` → `clearLines()` → `spawn()`. `spawn()` promotes `next` to `current` and triggers `endGame()` if the new piece collides immediately.
- **Game loop**: `loop()` runs on `requestAnimationFrame`, accumulating `dt` into `dropAccum` and dropping one row per `dropInterval`. Pause/game over work by `cancelAnimationFrame(animId)`; resuming calls `loop()` again after resetting `lastTime`.
- **Scoring/levels**: `LINE_SCORES[cleared] * level`; soft drop +1/row, hard drop +2/row. Level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level - 1) * 90)`. `updateHUD()` must be called after score/lines/level change.
- `init()` fully resets state and is also the restart button handler.

Board dimensions: if `COLS`, `ROWS` or `BLOCK` change, the `<canvas id="board">` `width`/`height` in `index.html` must be updated to `COLS*BLOCK` × `ROWS*BLOCK`. The next-piece preview assumes a 4×4 grid of 30px cells on a 120×120 canvas.
