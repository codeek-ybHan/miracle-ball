import { Race } from './race.js';
import * as renderer from './renderer.js';
import * as ui from './ui.js';
import * as viewport from './viewport.js';

ui.initUI();
ui.bindNameInput();
ui.bindStartButton(handleStart);
ui.bindRestartButton(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  ui.showSetup();
});
ui.showSetup();

const canvas = document.getElementById('game-canvas');
renderer.initRenderer(canvas);

// The canvas is resized to the real window on load and on every resize
// (instead of a fixed-resolution buffer that gets letterboxed), so it
// always fills the screen edge-to-edge no matter the window's aspect ratio.
function resizeCanvas() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  viewport.setViewportSize(w, h);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let race = null;
let lastTime = 0;
let rafId = null;

function handleStart() {
  const names = ui.parseNames();
  if (names.length < 2) return;

  if (rafId !== null) cancelAnimationFrame(rafId);

  race = new Race(names);
  ui.showRace();

  lastTime = performance.now();
  rafId = requestAnimationFrame(loop);
}

// Keeps looping even after every marble has finished, instead of stopping
// dead the instant the last one crosses — otherwise the finish-line spark
// burst and any still-spinning obstacles freeze mid-animation, looking like
// the game crashed rather than settling into its finished state.
function loop(now) {
  const delta = Math.min(now - lastTime, 50);
  lastTime = now;

  race.update(delta);
  renderer.render(race);
  ui.updateRankPanel(race.getUnfinishedRanking());
  ui.updateFinalRanking(race.getFinalRanking(), race.isFinished());

  rafId = requestAnimationFrame(loop);
}
