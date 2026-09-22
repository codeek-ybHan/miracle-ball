import * as physics from '../physics.js';
import { MARBLE_RADIUS, MARBLE_RESTITUTION, MARBLE_FRICTION, MARBLE_FRICTION_AIR, JITTER_FORCE } from '../config.js';

export class Marble {
  constructor(name, index, total, spawnCenterX, spawnHalfWidth) {
    this.name = name;
    this.hue = Math.round((index / Math.max(total, 1)) * 360);
    this.color = `hsl(${this.hue}, 85%, 60%)`;
    this.finished = false;
    this.rank = null;

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

    this.body = physics.createCircleBody(spawnX, spawnY, MARBLE_RADIUS, {
      restitution: MARBLE_RESTITUTION,
      friction: MARBLE_FRICTION,
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
  }
}
