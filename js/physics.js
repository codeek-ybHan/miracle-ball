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

export function addBody(body) {
  Matter.World.add(world, body);
}

export function addBodies(bodies) {
  Matter.World.add(world, bodies);
}

export function removeBody(body) {
  Matter.World.remove(world, body);
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

export function onCollisionStart(callback) {
  Matter.Events.on(engine, 'collisionStart', (event) => callback(event.pairs));
}
