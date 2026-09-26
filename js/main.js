import { Race } from './race.js';
import * as renderer from './renderer.js';
import * as ui from './ui.js';
import * as viewport from './viewport.js';
import * as config from './config.js';

let race = null;
let lastTime = 0;
let rafId = null;

ui.initUI();

// Restored before the very first setup preview renders below, so that
// preview (and everything else) already reflects whichever theme was
// picked last time instead of flashing the default first.
const savedThemeId = localStorage.getItem('miracleball-theme');
const initialThemeId = config.THEME_LIST.some((t) => t.id === savedThemeId) ? savedThemeId : 'dark';
config.applyTheme(initialThemeId);
ui.setSelectedTheme(initialThemeId);
// Tracks which theme's course/marble-shape a Race should use — separate
// from COLORS (which is mutated in place and read live by every consumer)
// since the course layout and marble shape are chosen once per Race at
// construction time, not read continuously each frame.
let currentThemeId = initialThemeId;

ui.bindNameInput();
ui.bindShuffleButton();
ui.bindStartButton(handleStart);
ui.bindThemeButtons((themeId) => {
  config.applyTheme(themeId);
  currentThemeId = themeId;
  localStorage.setItem('miracleball-theme', themeId);
  ui.setSelectedTheme(themeId);
  renderSetupPreview();
});
ui.bindRestartButton(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  race = null;
  ui.showSetup();
  renderSetupPreview();
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
  if (!race) renderSetupPreview();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Before the race actually starts, the canvas keeps rendering behind the
// (now translucent) setup screen instead of sitting blank — a snapshot of
// the real course with marbles resting exactly at their starting spawn
// positions. It's a fresh Race that's built but never stepped (physics.step
// never runs on it here), so marbles stay put instead of falling; typing a
// new name list or resizing the window just rebuilds and redraws that same
// static snapshot.
function renderSetupPreview() {
  const names = ui.parseNames();
  const previewNames = names.length > 0 ? names : ['1', '2', '3'];
  renderer.render(new Race(previewNames, currentThemeId));
}
ui.onNamesChanged(renderSetupPreview);

function handleStart() {
  const names = ui.parseNames();
  if (names.length < 2) return;

  if (rafId !== null) cancelAnimationFrame(rafId);

  race = new Race(names, currentThemeId);
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
