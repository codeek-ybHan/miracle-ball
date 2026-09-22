import * as physics from '../physics.js';
import {
  MARBLE_RADIUS,
  MARBLE_RESTITUTION,
  MARBLE_FRICTION,
  MARBLE_FRICTION_AIR,
  JITTER_FORCE,
  JITTER_TORQUE,
} from '../config.js';

export class Marble {
  constructor(name, index, total, spawnCenterX, spawnHalfWidth, shape = 'circle') {
    this.name = name;
    this.hue = Math.round((index / Math.max(total, 1)) * 360);
    this.color = `hsl(${this.hue}, 85%, 60%)`;
    this.finished = false;
    this.rank = null;
    // Circumradius of every marble shape (circle/square/hexagon) is always
    // exactly MARBLE_RADIUS by construction (see physics.js's
    // createMarbleBody) — stored once here so renderer.js can size the
    // slow-zone ring / name-label offset shape-agnostically, since
    // body.circleRadius is undefined for non-circle Matter bodies.
    this.radius = MARBLE_RADIUS;

    const margin = 20 + MARBLE_RADIUS;
    const usableHalfWidth = Math.max(spawnHalfWidth - margin, 10);
    const usableWidth = usableHalfWidth * 2;
    // Evenly spaced starting lanes across the tube's width (with a little
    // per-marble jitter so it doesn't look like a rigid grid) instead of
    // fully random X. Random placement could land several marbles right on
    // top of each other by pure chance, especially near the center — and a
    // tight cluster falling with almost no separation tends to thread the
    // exact same gap through every peg row together, so they'd stay bunched
    // the whole way down and cross the finish as a practically untouched
    // pack instead of getting split up by the course.
    const slot = total > 1 ? (index + 0.5) / total : 0.5;
    const jitterRange = (usableWidth / Math.max(total, 1)) * 0.4;
    const spawnX = spawnCenterX - usableHalfWidth + slot * usableWidth + (Math.random() * 2 - 1) * jitterRange;
    const spawnY = 10 + Math.random() * 60;

    this.body = physics.createMarbleBody(shape, spawnX, spawnY, MARBLE_RADIUS, {
      restitution: MARBLE_RESTITUTION,
      friction: MARBLE_FRICTION,
      // Matter.js defaults frictionStatic to 0.5 regardless of `friction`
      // (the kinetic value), and it's what actually governs whether a
      // slow/resting marble can start moving again — 0.5 needs a ~27deg
      // slope just to break free from rest, so a marble that slows to a
      // near-stop on any shallower static surface (the slalom planks, most
      // of all) gets stuck dead until enough random jitter happens to nudge
      // it loose, sometimes for tens of seconds. Matching it to the low
      // kinetic value means a marble never has a fundamentally different
      // threshold for "start sliding" vs. "keep sliding".
      frictionStatic: MARBLE_FRICTION,
      frictionAir: MARBLE_FRICTION_AIR,
      label: 'marble',
      // Marbles never collide with each other (only with walls/obstacles):
      // without this, a crowd resting together past the finish line for a
      // long time slowly destabilizes under Matter.js's contact resolution
      // and can launch one at extreme velocity, and even short of that they
      // can physically wall off the goal line for whoever's still racing.
      collisionFilter: { group: -1 },
    });
  }

  getPosition() {
    return this.body.position;
  }

  jitter() {
    physics.applyForceToBody(this.body, {
      x: (Math.random() - 0.5) * JITTER_FORCE,
      y: 0,
    });
    // See config.js's JITTER_TORQUE — a no-op for a circle, but the only
    // thing that can rotate a wedged square/hexagon marble loose.
    physics.applyTorqueToBody(this.body, (Math.random() - 0.5) * JITTER_TORQUE);
  }
}
