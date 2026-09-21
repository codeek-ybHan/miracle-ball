let setupScreen, raceScreen;
let nameInput, participantCount, startBtn;
let rankPanel, rankList, finalOverlay, finalRankList, restartBtn, gameCanvas;

export function initUI() {
  setupScreen = document.getElementById('setup-screen');
  raceScreen = document.getElementById('race-screen');

  nameInput = document.getElementById('name-input');
  participantCount = document.getElementById('participant-count');
  startBtn = document.getElementById('start-btn');

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

export function refreshParticipantCount() {
  const count = parseNames().length;
  participantCount.textContent = `참가자: ${count}명`;
  startBtn.disabled = count < 2;
}

export function bindNameInput() {
  nameInput.addEventListener('input', refreshParticipantCount);
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
  refreshParticipantCount();
}

export function showRace() {
  setupScreen.classList.add('hidden');
  raceScreen.classList.remove('hidden');
  finalOverlay.classList.add('hidden');
  finalRankList.innerHTML = '';
  restartBtn.classList.add('hidden');
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
