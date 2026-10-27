'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
  '#fff176', // P - single (amarillo claro)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (tuerca)
  [[9]],                                       // P (single 1x1)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

let gridColor = '#22222e';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo = 0, maxCombo = 0;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  // combo: piezas consecutivas que limpian líneas
  combo = cleared ? combo + 1 : 0;
  maxCombo = Math.max(maxCombo, combo);
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  showGameOverRecords();
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() dentro de este frame no puede cancelar el frame en curso: no reprogramar
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  commitPendingRecord(); // reiniciar sin pulsar Guardar no pierde el record
  gameoverRecords.classList.add('hidden');
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // no jugar mientras se escribe el nombre ni antes de pulsar Jugar
  if (e.target instanceof HTMLInputElement) return;
  if (!current) {
    if (e.code === 'Enter') { e.preventDefault(); startGame(); }
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(theme) {
  const isLight = theme === 'light';
  if (isLight) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  themeToggle.setAttribute('aria-checked', String(isLight));
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
  // en pausa o game over el loop no redibuja el canvas
  if (current) { draw(); drawNext(); }
  else { ctx.clearRect(0, 0, canvas.width, canvas.height); drawGrid(); } // antes de la primera partida
}

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  try { localStorage.setItem('theme', theme); } catch (e) {}
  applyTheme(theme);
  themeToggle.blur(); // evita que Space active el switch
});

let savedTheme = 'dark';
try { savedTheme = localStorage.getItem('theme') === 'light' ? 'light' : 'dark'; } catch (e) {}
applyTheme(savedTheme);

// ---- Records locales (localStorage 'records') ----
// { top: [{ name, score, lines, combo, date }] (máx. 5, ordenado), bestCombo, maxLines }

const MAX_RECORDS = 5;
const RECORDS_KEY = 'records';
const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const gameoverRecords = document.getElementById('gameover-records');
const recordMsg = document.getElementById('record-msg');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');

let pendingRecord = null; // partida que entra en el top y espera nombre
let highlightIndex = -1;  // fila a resaltar en la tabla de game over

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function toCount(v) {
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function loadRecords() {
  let data;
  try { data = JSON.parse(localStorage.getItem(RECORDS_KEY)); } catch (e) { return emptyRecords(); }
  if (!data || typeof data !== 'object') return emptyRecords();
  const top = (Array.isArray(data.top) ? data.top : [])
    .filter(r => r && typeof r === 'object' && typeof r.name === 'string' && Number.isFinite(r.score))
    .map(r => ({
      name: r.name.slice(0, 12),
      score: toCount(r.score),
      lines: toCount(r.lines),
      combo: toCount(r.combo),
      date: typeof r.date === 'string' ? r.date : '',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);
  return { top, bestCombo: toCount(data.bestCombo), maxLines: toCount(data.maxLines) };
}

function saveRecords(data) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(data)); } catch (e) {}
}

function qualifiesForTop(data, value) {
  return value > 0 && (data.top.length < MAX_RECORDS || value > data.top[data.top.length - 1].score);
}

function formatDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// Pinta la tabla en todos los contenedores [data-records] (inicio y game over)
function renderRecords(data = loadRecords()) {
  document.querySelectorAll('[data-records]').forEach(container => {
    const inGameOver = gameoverRecords.contains(container);
    container.replaceChildren();

    if (!data.top.length) {
      const empty = document.createElement('p');
      empty.className = 'records-empty';
      empty.textContent = 'Aún no hay records';
      container.appendChild(empty);
    } else {
      const table = document.createElement('table');
      table.className = 'records-table';
      const head = table.createTHead().insertRow();
      for (const h of ['#', 'Nombre', 'Puntos', 'Líneas', 'Combo', 'Fecha']) {
        const th = document.createElement('th');
        th.textContent = h;
        head.appendChild(th);
      }
      const body = table.createTBody();
      data.top.forEach((r, i) => {
        const row = body.insertRow();
        if (inGameOver && i === highlightIndex) row.className = 'highlight';
        // textContent: el nombre lo escribe el jugador, nunca como HTML
        for (const v of [i + 1, r.name, r.score.toLocaleString(), r.lines, r.combo, formatDate(r.date)]) {
          row.insertCell().textContent = v;
        }
      });
      container.appendChild(table);
    }

    const stats = document.createElement('p');
    stats.className = 'records-stats';
    stats.textContent = `Mejor combo: ${data.bestCombo} · Líneas máx.: ${data.maxLines}`;
    container.appendChild(stats);
  });
}

// Llamada desde endGame(): actualiza estadísticas y pide nombre si entra en el top
function showGameOverRecords() {
  const data = loadRecords();
  data.bestCombo = Math.max(data.bestCombo, maxCombo);
  data.maxLines = Math.max(data.maxLines, lines);
  saveRecords(data);

  highlightIndex = -1;
  pendingRecord = null;
  if (qualifiesForTop(data, score)) {
    pendingRecord = { score, lines, combo: maxCombo, date: new Date().toISOString() };
    recordMsg.textContent = '¡Nuevo récord! Entras en el top 5. Escribe tu nombre:';
    recordMsg.classList.remove('hidden');
    nameForm.classList.remove('hidden');
    nameInput.value = '';
  } else {
    recordMsg.classList.add('hidden');
    nameForm.classList.add('hidden');
  }
  gameoverRecords.classList.remove('hidden');
  // sin autofocus: las teclas de juego aún pulsadas acabarían escritas en el nombre
  renderRecords(data);
}

// Inserta la partida pendiente en el top 5 y devuelve su posición
function commitPendingRecord() {
  if (!pendingRecord) return { idx: -1, data: loadRecords() };
  const entry = { name: nameInput.value.trim().slice(0, 12) || 'Anónimo', ...pendingRecord };
  pendingRecord = null;
  const data = loadRecords();
  let idx = data.top.findIndex(r => entry.score > r.score);
  if (idx === -1) idx = data.top.length;
  data.top.splice(idx, 0, entry);
  data.top = data.top.slice(0, MAX_RECORDS);
  saveRecords(data);
  return { idx: idx < MAX_RECORDS ? idx : -1, data };
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  const { idx, data } = commitPendingRecord();
  highlightIndex = idx;
  nameForm.classList.add('hidden');
  if (idx >= 0) recordMsg.textContent = `¡Nuevo récord! Puesto #${idx + 1}`;
  renderRecords(data);
  nameInput.blur();
});

document.querySelectorAll('.records-reset').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.blur();
    if (!confirm('¿Borrar todos los records?')) return;
    try { localStorage.removeItem(RECORDS_KEY); } catch (e) {}
    // descarta también la partida pendiente de guardar
    pendingRecord = null;
    highlightIndex = -1;
    recordMsg.classList.add('hidden');
    nameForm.classList.add('hidden');
    renderRecords();
  });
});

function startGame() {
  if (startScreen.classList.contains('hidden')) return;
  startScreen.classList.add('hidden');
  playBtn.blur();
  init();
}

playBtn.addEventListener('click', startGame);

// Arranque: pantalla de inicio con la tabla (applyTheme ya pintó la rejilla vacía);
// init() se ejecuta al pulsar Jugar o Enter
renderRecords();
