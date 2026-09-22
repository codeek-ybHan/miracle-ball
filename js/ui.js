let setupScreen, raceScreen;
let nameInput, participantCount, startBtn, shuffleBtn, themeButtons;
let rankPanel, rankList, finalOverlay, finalRankList, restartBtn, gameCanvas;

export function initUI() {
  setupScreen = document.getElementById('setup-screen');
  raceScreen = document.getElementById('race-screen');

  nameInput = document.getElementById('name-input');
  participantCount = document.getElementById('participant-count');
  startBtn = document.getElementById('start-btn');
  shuffleBtn = document.getElementById('shuffle-btn');
  themeButtons = document.querySelectorAll('.theme-btn');

  rankPanel = document.getElementById('rank-panel');
  rankList = document.getElementById('rank-list');
  finalOverlay = document.getElementById('final-overlay');
  finalRankList = document.getElementById('final-rank-list');
  restartBtn = document.getElementById('restart-btn');
  gameCanvas = document.getElementById('game-canvas');
}

export function parseNames() {
  return nameInput.value
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

let namesChangedHandler = null;

export function refreshParticipantCount() {
  const count = parseNames().length;
  participantCount.textContent = `참가자: ${count}명`;
  startBtn.disabled = count < 2;
  if (namesChangedHandler) namesChangedHandler();
}

export function bindNameInput() {
  nameInput.addEventListener('input', refreshParticipantCount);
}

// Fires whenever the name list could have changed — both from the user
// typing (via refreshParticipantCount, above) and from the shuffle
// animation's programmatic rewrites (which also call refreshParticipantCount
// each frame), so main.js can keep the setup-screen course preview in sync
// with whatever's actually in the textarea right now.
export function onNamesChanged(handler) {
  namesChangedHandler = handler;
}

function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Merges duplicate names into one line tagged "*N" before shuffling, so
// pasting a raw list that mentions the same person multiple times doesn't
// silently spawn them as separate racers — the count stays visible instead.
// The reorder plays out as a quick flicker of intermediate shuffles (rather
// than snapping straight to the final order) so pressing the button reads as
// "shuffling right now" instead of an instant, easy-to-miss swap.
const SHUFFLE_FRAMES = 10;
const SHUFFLE_FRAME_MS = 70;

function shuffleNames() {
  const counts = new Map();
  parseNames().forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
  const merged = [...counts.entries()].map(([name, count]) => (count > 1 ? `${name}*${count}` : name));
  if (merged.length === 0) return;

  shuffleBtn.disabled = true;
  let frame = 0;
  const tick = () => {
    nameInput.value = shuffleArray(merged).join('\n');
    refreshParticipantCount();
    frame++;
    if (frame < SHUFFLE_FRAMES) {
      setTimeout(tick, SHUFFLE_FRAME_MS);
    } else {
      shuffleBtn.disabled = false;
    }
  };
  tick();
}

export function bindShuffleButton() {
  shuffleBtn.addEventListener('click', shuffleNames);
}

export function bindThemeButtons(handler) {
  themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => handler(btn.dataset.theme));
  });
}

export function setSelectedTheme(themeId) {
  themeButtons.forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.theme === themeId);
  });
}

export function bindStartButton(handler) {
  startBtn.addEventListener('click', handler);
}

export function bindRestartButton(handler) {
  restartBtn.addEventListener('click', handler);
}

export function showSetup() {
  setupScreen.classList.remove('hidden');
  raceScreen.classList.add('hidden');
  gameCanvas.classList.add('preview-dim');
  refreshParticipantCount();
}

export function showRace() {
  setupScreen.classList.add('hidden');
  raceScreen.classList.remove('hidden');
  finalOverlay.classList.add('hidden');
  finalRankList.innerHTML = '';
  restartBtn.classList.add('hidden');
  gameCanvas.classList.remove('preview-dim');
  gameCanvas.classList.remove('dimmed');
  rankPanel.classList.remove('dimmed');
}

function renderRankItems(list, ranking) {
  list.innerHTML = '';
  ranking.forEach((marble, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="rank-num">${i + 1}</span><span class="rank-dot" style="background:${marble.color}"></span><span class="rank-name">${marble.name}</span>`;
    list.appendChild(li);
  });
}

export function updateRankPanel(unfinishedRanking) {
  renderRankItems(rankList, unfinishedRanking);
}

// The moment the first marble finishes (1등 확정), that's the real "game
// over" beat — a centered overlay takes over as the focus and keeps
// growing as more marbles cross, while the canvas and live-rank panel dim
// into the background since the outcome for the rest is just a formality.
export function updateFinalRanking(finalRanking, isComplete) {
  if (finalRanking.length === 0) return;
  finalOverlay.classList.remove('hidden');
  gameCanvas.classList.add('dimmed');
  rankPanel.classList.add('dimmed');
  renderRankItems(finalRankList, finalRanking);
  restartBtn.classList.toggle('hidden', !isComplete);
}
