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

// Picks how large the world renders so the tube fills most of the real
// window width, regardless of the window's size — called once when a race
// starts. The physics/course coordinates themselves never change.
export function configureBaseZoom() {
  const tubeWidth = TUBE_HALF_WIDTH * 2;
  const fit = (viewport.getWidth() * CAMERA_BASE_FILL_RATIO) / tubeWidth;
  baseZoom = Math.min(CAMERA_BASE_MAX, Math.max(CAMERA_BASE_MIN, fit));
}

export function follow(x, y) {
  target.x = x;
  target.y = y;

  const goalDist = Math.abs(GOAL_Y - y);
  targetZoom = Math.max(1, Math.min(CAMERA_MAX_ZOOM, (1 - goalDist / CAMERA_ZOOM_THRESHOLD) * CAMERA_MAX_ZOOM));
}

export function update(deltaMs) {
  const factor = 1 - Math.pow(0.5, deltaMs / CAMERA_SMOOTH_MS);
  position.x += (target.x - position.x) * factor;
  position.y += (target.y - position.y) * factor;
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
