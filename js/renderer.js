import * as particleManager from './particleManager.js';
import * as camera from './camera.js';
import * as viewport from './viewport.js';
import { centerX, tubeHalfWidthAt } from './map.js';
import {
  COURSE_WIDTH,
  COURSE_HEIGHT,
  GOAL_Y,
  PEG_BOUNCE_MS,
  PEG_BOUNCE_SCALE,
  MAGNET_RADIUS,
  COLORS,
} from './config.js';

let ctx = null;

export function initRenderer(canvas) {
  ctx = canvas.getContext('2d');
}

function pathVertices(body) {
  const vertices = body.vertices;
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
}

function clear() {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, viewport.getWidth(), viewport.getHeight());
}

function drawCourseBackground() {
  ctx.fillStyle = COLORS.courseBg;
  ctx.fillRect(0, 0, COURSE_WIDTH, COURSE_HEIGHT);
}

function drawWall(body) {
  pathVertices(body);
  ctx.fillStyle = COLORS.wall;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.wallEdge;
  ctx.stroke();
}

function drawPeg(body) {
  const { x, y } = body.position;
  const elapsed = performance.now() - body.plugin.hitAt;
  let r = body.circleRadius;

  if (elapsed < PEG_BOUNCE_MS) {
    const t = 1 - elapsed / PEG_BOUNCE_MS;
    r *= 1 + (PEG_BOUNCE_SCALE - 1) * t * t;
  }

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.peg;
  ctx.fill();
}

function drawBumper(body) {
  const { x, y } = body.position;
  const r = body.circleRadius;
  const lit = body.plugin && performance.now() < body.plugin.flashUntil;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = lit ? COLORS.bumperFlash : COLORS.bumper;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = lit ? COLORS.bumper : COLORS.bumperRing;
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.bumperRing;
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawTrampoline(body) {
  const lit = body.plugin && performance.now() < body.plugin.flashUntil;
  pathVertices(body);
  ctx.fillStyle = lit ? COLORS.trampolineFlash : COLORS.trampoline;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.trampolineEdge;
  ctx.stroke();
}

function drawBodies(bodies) {
  bodies.forEach((body) => {
    if (body.label === 'spinner') return;
    if (body.label === 'bumper') return drawBumper(body);
    if (body.label === 'peg') return drawPeg(body);
    if (body.label === 'trampoline') return drawTrampoline(body);
    drawWall(body);
  });
}

function drawMagnets(magnets, repelling) {
  const pulse = (performance.now() % 700) / 700; // 0..1 breathing cycle
  magnets.forEach((magnet) => {
    const ringR = MAGNET_RADIUS * (0.55 + 0.15 * Math.sin(pulse * Math.PI * 2));
    ctx.beginPath();
    ctx.arc(magnet.x, magnet.y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = repelling ? COLORS.magnetRepel : COLORS.magnet;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(magnet.x, magnet.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = repelling ? COLORS.magnetRepel : COLORS.magnet;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(magnet.x, magnet.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.magnetCore;
    ctx.fill();
  });
}

function drawSpinners(spinners) {
  spinners.forEach((s) => {
    pathVertices(s.body);
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = s.color === COLORS.windmill ? COLORS.windmillEdge : COLORS.spinnerEdge;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.body.position.x, s.body.position.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.background;
    ctx.fill();
  });
}

function drawWindZones(windZones) {
  windZones.forEach((zone) => {
    ctx.fillStyle = COLORS.wind;
    ctx.fillRect(0, zone.yStart, COURSE_WIDTH, zone.yEnd - zone.yStart);
  });
}

function drawGoalLine() {
  const cx = centerX(GOAL_Y);
  const halfWidth = tubeHalfWidthAt(GOAL_Y);
  ctx.strokeStyle = COLORS.goalLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(cx - halfWidth, GOAL_Y);
  ctx.lineTo(cx + halfWidth, GOAL_Y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawMarbles(marbles, dynamicZoom) {
  marbles.forEach((m) => {
    const pos = m.getPosition();
    const radius = m.body.circleRadius;

    ctx.globalAlpha = m.finished ? 0.4 : 1;

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = m.color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `hsl(${m.hue}, 70%, 30%)`;
    ctx.stroke();

    ctx.globalAlpha = 1;

    // Names scale with the base (screen-fit) zoom but stay put during the
    // extra near-goal zoom-in, so they never balloon to an unreadable size.
    ctx.save();
    ctx.translate(pos.x, pos.y + radius + 6);
    ctx.scale(1 / dynamicZoom, 1 / dynamicZoom);
    ctx.font = '600 12px "Baloo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#05060f';
    ctx.fillStyle = m.color;
    ctx.strokeText(m.name, 0, 0);
    ctx.fillText(m.name, 0, 0);
    ctx.restore();
  });
}

export function render(race) {
  clear();
  const cam = camera.getTransform();
  ctx.save();
  ctx.translate(viewport.getWidth() / 2, viewport.getAnchorY());
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  drawCourseBackground();
  drawWindZones(race.windZones);
  drawMagnets(race.magnets, race.isMagnetRepelling());
  drawBodies(race.walls);
  drawSpinners(race.spinners);
  drawGoalLine();
  drawMarbles(race.marbles, cam.dynamicZoom);
  particleManager.draw(ctx);

  ctx.restore();
}
