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
  WIND_VORTEX_RADIUS,
  BOUNCE_PAD_SINK_MS,
  BOUNCE_PAD_SINK_DEPTH,
  BOUNCE_PAD_SPRING_MS,
  BOUNCE_PAD_SPRING_HEIGHT,
  BOUNCE_PAD_SETTLE_MS,
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

const BOUNCE_PAD_ANIM_MS = BOUNCE_PAD_SINK_MS + BOUNCE_PAD_SPRING_MS + BOUNCE_PAD_SETTLE_MS;

// Positive = the mat's center dipping down (sinking under a landing
// marble's "weight"); negative = springing up past neutral. Three eased
// phases chained back to back: sink down, spring up past neutral (bigger
// than the dip, for a real overshoot), then ease back to flat.
function bouncePadDeflection(elapsedMs) {
  if (elapsedMs < BOUNCE_PAD_SINK_MS) {
    const t = elapsedMs / BOUNCE_PAD_SINK_MS;
    return BOUNCE_PAD_SINK_DEPTH * Math.sin((t * Math.PI) / 2);
  }
  const afterSink = elapsedMs - BOUNCE_PAD_SINK_MS;
  if (afterSink < BOUNCE_PAD_SPRING_MS) {
    const t = afterSink / BOUNCE_PAD_SPRING_MS;
    const eased = 0.5 - 0.5 * Math.cos(t * Math.PI);
    return BOUNCE_PAD_SINK_DEPTH + (-BOUNCE_PAD_SPRING_HEIGHT - BOUNCE_PAD_SINK_DEPTH) * eased;
  }
  const afterSpring = afterSink - BOUNCE_PAD_SPRING_MS;
  const t = afterSpring / BOUNCE_PAD_SETTLE_MS;
  const eased = 0.5 - 0.5 * Math.cos(Math.min(t, 1) * Math.PI);
  return -BOUNCE_PAD_SPRING_HEIGHT * (1 - eased);
}

// A small permanent upward bow even at rest, so it reads as a taut,
// springy mat on sight instead of looking like a plain flat bar right up
// until the first hit.
const BOUNCE_PAD_REST_ARC = -5;

// Drawn as a flexing mat (curved top/bottom edges pinned at two end posts,
// like a real trampoline pinned to its frame) instead of the plain static
// rectangle the physics body actually is — the body itself never changes
// shape, this is purely a skin on top of it.
function drawBouncePad(body) {
  const { x, y } = body.position;
  const halfWidth = (body.bounds.max.x - body.bounds.min.x) / 2;
  const halfThickness = (body.bounds.max.y - body.bounds.min.y) / 2;
  const elapsed = performance.now() - body.plugin.hitAt;
  const deflection = BOUNCE_PAD_REST_ARC + (elapsed < BOUNCE_PAD_ANIM_MS ? bouncePadDeflection(elapsed) : 0);
  const lit = performance.now() < body.plugin.flashUntil;

  const leftX = x - halfWidth;
  const rightX = x + halfWidth;
  const topY = y - halfThickness;
  const bottomY = y + halfThickness;
  // *2 because a quadratic curve's own midpoint only reaches halfway to its
  // control point, so this keeps the mat's visible peak matching the
  // config constants' actual px values instead of being half as tall.
  const controlTopY = topY + deflection * 2;
  const controlBottomY = bottomY + deflection * 2;

  ctx.beginPath();
  ctx.moveTo(leftX, topY);
  ctx.quadraticCurveTo(x, controlTopY, rightX, topY);
  ctx.lineTo(rightX, bottomY);
  ctx.quadraticCurveTo(x, controlBottomY, leftX, bottomY);
  ctx.closePath();
  ctx.fillStyle = lit ? COLORS.bouncePadFlash : COLORS.bouncePad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.bouncePadEdge;
  ctx.stroke();

  // End posts, anchoring the mat to something — otherwise a lone curved
  // shape floating in the tube doesn't read as "pinned down and springy".
  const postRadius = halfThickness * 0.9;
  ctx.fillStyle = COLORS.bouncePadEdge;
  [leftX, rightX].forEach((postX) => {
    ctx.beginPath();
    ctx.arc(postX, y, postRadius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBodies(bodies) {
  bodies.forEach((body) => {
    if (body.label === 'spinner') return;
    if (body.label === 'bumper') return drawBumper(body);
    if (body.label === 'peg') return drawPeg(body);
    if (body.label === 'trampoline') return drawTrampoline(body);
    if (body.label === 'bouncePad') return drawBouncePad(body);
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

// Three rotating arcs read as a spinning pinwheel/whirlwind — spins slowly
// while pulling marbles in, then snaps to spin the other way (and faster)
// during the burst, so the direction reversal itself telegraphs "now it's
// pushing out" independent of the color change.
function drawWindVortices(vortices, bursting) {
  const rotation = (performance.now() / 1000) * (bursting ? -5 : 1.6);
  const color = bursting ? COLORS.windVortexBurst : COLORS.windVortex;
  vortices.forEach((vortex) => {
    // Faint outer ring showing the actual pull/burst radius, same idea as
    // the magnet's breathing ring.
    ctx.beginPath();
    ctx.arc(vortex.x, vortex.y, WIND_VORTEX_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.12;
    ctx.stroke();
    ctx.globalAlpha = 1;

    for (let i = 0; i < 3; i++) {
      const r = 18 + i * 16;
      const startAngle = rotation + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(vortex.x, vortex.y, r, startAngle, startAngle + Math.PI * 0.55);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.45;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(vortex.x, vortex.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(vortex.x, vortex.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.windVortexCore;
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
  drawWindVortices(race.windVortices, race.isWindVortexBursting());
  drawBodies(race.walls);
  drawSpinners(race.spinners);
  drawGoalLine();
  drawMarbles(race.marbles, cam.dynamicZoom);
  particleManager.draw(ctx);

  ctx.restore();
}
