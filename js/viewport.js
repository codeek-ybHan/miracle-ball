import { VIEWPORT_ANCHOR_RATIO } from './config.js';

let width = window.innerWidth;
let height = window.innerHeight;

export function setViewportSize(w, h) {
  width = w;
  height = h;
}

export function getWidth() {
  return width;
}

export function getHeight() {
  return height;
}

export function getAnchorY() {
  return height * VIEWPORT_ANCHOR_RATIO;
}
