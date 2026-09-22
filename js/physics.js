import { GRAVITY_Y } from './config.js';

let engine = null;
let world = null;

export function initPhysics() {
  engine = Matter.Engine.create();
  engine.enableSleeping = false;
  world = engine.world;
  world.gravity.y = GRAVITY_Y;
  return engine;
}

export function step(deltaMs) {
  Matter.Engine.update(engine, deltaMs);
}

export function createCircleBody(x, y, radius, options = {}) {
  return Matter.Bodies.circle(x, y, radius, options);
}

export function createRectBody(x, y, w, h, options = {}) {
  return Matter.Bodies.rectangle(x, y, w, h, options);
}

// shape: 'circle' | 'square' | 'hexagon'. A regular polygon's circumradius
// (Matter.Bodies.polygon's `radius` param) equals `radius` exactly, and a
// regular polygon inscribed in a circle of that radius never extends beyond
// it in any direction — so every existing clearance computed for a radius-R
// circular marble (spawn margin, WALL_PUSH_MARGIN, every obstacle gap in
// map.js) remains a valid, slightly-conservative bound for square/hexagon
// marbles of the same radius too. Deliberately no concave shape (star,
// etc.) — that needs Matter.Bodies.fromVertices + the poly-decomp library
// for concave decomposition (not loaded in index.html), and concave
// notches are exactly the geometry class that caused this session's
// funnel-wedge and tube-wall-joint traps.
export function createMarbleBody(shape, x, y, radius, options = {}) {
  if (shape === 'square') return Matter.Bodies.polygon(x, y, 4, radius, options);
  if (shape === 'hexagon') return Matter.Bodies.polygon(x, y, 6, radius, options);
  return Matter.Bodies.circle(x, y, radius, options);
}

export function addBody(body) {
  Matter.World.add(world, body);
}

export function addBodies(bodies) {
  Matter.World.add(world, bodies);
}

export function removeBody(body) {
  Matter.World.remove(world, body);
}

export function setBodyStatic(body, isStatic) {
  Matter.Body.setStatic(body, isStatic);
}

export function setBodyAngularVelocity(body, value) {
  Matter.Body.setAngularVelocity(body, value);
}

export function setBodyAngle(body, angle) {
  Matter.Body.setAngle(body, angle);
}

export function setBodyVelocity(body, velocity) {
  Matter.Body.setVelocity(body, velocity);
}

export function setBodyPosition(body, position) {
  Matter.Body.setPosition(body, position);
}

export function applyForceToBody(body, force) {
  Matter.Body.applyForce(body, body.position, force);
}

export function applyTorqueToBody(body, torque) {
  body.torque += torque;
}

export function onCollisionStart(callback) {
  Matter.Events.on(engine, 'collisionStart', (event) => callback(event.pairs));
}
