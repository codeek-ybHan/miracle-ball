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
  constructor(name, index, total, spawnCenterX, spawnHalfWidth, shape = 'circle', pour = false) {
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
    let spawnY = 10 + Math.random() * 60;
    let spawnXFinal = spawnX;
    if (pour) {
      // lazygyu/roulette's start: marbles stand in rows of 10, 0.6 units
      // apart (1 unit = 32px = 4 radii), the first row at y = rows units, each
      // row below it one unit nearer the top — a tight block that spills
      // down the chute together. They collide with each other, so it
      // really does tumble out as a crowd.
      const unit = 4 * MARBLE_RADIUS;
      const rows = Math.ceil(total / 10);
      const line = Math.floor(index / 10);
      const lineDelta = -Math.max(0, rows - 5);
      spawnXFinal = spawnCenterX + (-2.625 + (index % 10) * 0.6) * unit;
      spawnY = (rows - line + lineDelta) * unit;
    }
    this.body = physics.createMarbleBody(shape, spawnXFinal, spawnY, MARBLE_RADIUS, {
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
      collisionFilter: { category: 0x0002, mask: 0xffffffff },
      // Marbles DO collide with each other (like lazygyu/roulette) — they
      // jostle for position in the chute and pile up against bars. Once a
      // marble crosses the goal it stops colliding with the others (see
      // race.js), so a finished crowd can't wall off the goal line for
      // whoever is still racing or destabilise into a launched marble.
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
