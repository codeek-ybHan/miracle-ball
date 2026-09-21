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
    const spawnX = spawnCenterX + (Math.random() * 2 - 1) * usableHalfWidth;
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
