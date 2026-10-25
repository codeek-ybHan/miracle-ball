import {
  COURSE_WIDTH,
  COURSE_HEIGHT,
  TUBE_HALF_WIDTH,
  CAMERA_SMOOTH_MS,
  CAMERA_MAX_ZOOM,
  CAMERA_ZOOM_THRESHOLD,
  CAMERA_BASE_FILL_RATIO,
  CAMERA_BASE_MIN,
  CAMERA_BASE_MAX,
  GOAL_Y,
} from './config.js';
import * as viewport from './viewport.js';

const position = { x: COURSE_WIDTH / 2, y: 0 };
const target = { x: COURSE_WIDTH / 2, y: 0 };
let baseZoom = 1;
let zoom = 1;
let targetZoom = 1;
// Leader's velocity in world px/ms, low-pass filtered so a bounce off a peg
// doesn't whip the camera around — see update()'s feed-forward.
const velocity = { x: 0, y: 0 };
const rawVelocity = { x: 0, y: 0 };
const VELOCITY_SMOOTH_MS = 150;
const MS_PER_STEP = 1000 / 60;

// Picks how large the world renders so the tube fills most of the real
// window width, regardless of the window's size — called once when a race
// starts. The physics/course coordinates themselves never change.
export function configureBaseZoom() {
  const tubeWidth = TUBE_HALF_WIDTH * 2;
  const fit = (viewport.getWidth() * CAMERA_BASE_FILL_RATIO) / tubeWidth;
  baseZoom = Math.min(CAMERA_BASE_MAX, Math.max(CAMERA_BASE_MIN, fit));
}

// vx/vy are the followed body's Matter velocity (px per 60fps step).
export function follow(x, y, vx = 0, vy = 0) {
  target.x = x;
  target.y = y;
  rawVelocity.x = vx / MS_PER_STEP;
  rawVelocity.y = vy / MS_PER_STEP;

  const goalDist = Math.abs(GOAL_Y - y);
  targetZoom = Math.max(1, Math.min(CAMERA_MAX_ZOOM, (1 - goalDist / CAMERA_ZOOM_THRESHOLD) * CAMERA_MAX_ZOOM));
}

export function update(deltaMs) {
  const factor = 1 - Math.pow(0.5, deltaMs / CAMERA_SMOOTH_MS);
  const velFactor = 1 - Math.pow(0.5, deltaMs / VELOCITY_SMOOTH_MS);
  velocity.x += (rawVelocity.x - velocity.x) * velFactor;
  velocity.y += (rawVelocity.y - velocity.y) * velFactor;
  // A first-order follow lags a moving target by velocity * tau at steady
  // state (tau = half-life / ln2). Aiming that far AHEAD of the leader
  // cancels the lag exactly, so a fast-falling marble stays at its anchor
  // point instead of drifting off-screen — worst near the goal, where the
  // zoom magnifies the same world-space lag several times over.
  const lead = CAMERA_SMOOTH_MS / Math.LN2;
  const aimX = target.x + velocity.x * lead;
  const aimY = target.y + velocity.y * lead;
  position.x += (aimX - position.x) * factor;
  position.y += (aimY - position.y) * factor;
  zoom += (targetZoom - zoom) * factor;
}

export function getTransform() {
  const canvasWidth = viewport.getWidth();
  const canvasHeight = viewport.getHeight();
  const anchorY = viewport.getAnchorY();
  const combinedZoom = baseZoom * zoom;

  const halfViewW = canvasWidth / 2 / combinedZoom;
  const topViewH = anchorY / combinedZoom;
  const bottomViewH = (canvasHeight - anchorY) / combinedZoom;

  const minX = halfViewW;
  const maxX = COURSE_WIDTH - halfViewW;
  const x = maxX >= minX ? Math.min(maxX, Math.max(minX, position.x)) : COURSE_WIDTH / 2;

  const minY = topViewH;
  const maxY = COURSE_HEIGHT - bottomViewH;
  const y = maxY >= minY ? Math.min(maxY, Math.max(minY, position.y)) : COURSE_HEIGHT / 2;

  // `zoom` is the full render scale (for the world transform); `dynamicZoom`
  // is just the near-goal portion, so UI elements like names can stay a
  // constant size relative to the base view and only shrink back during the
  // dramatic finish zoom instead of scaling with the (much larger) base zoom.
  return { x, y, zoom: combinedZoom, dynamicZoom: zoom };
}
