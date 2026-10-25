import * as physics from '../physics.js';

export const GATE_BAR_CATEGORY = 0x0008;

export class Spinner {
  // `pushMarbles` makes each rotation step count as real motion for Matter
  // (see physics.setBodyAngle's updateVelocity), so a marble touching the
  // bar is actually carried/flung by it instead of just being pushed out by
  // overlap correction.
  // `gate` (optional, finish bar only) makes the bar act as a catcher:
  //   holdAngle/holdUntilY — parked at holdAngle (blocking the slot mouth)
  //     until the lead marble reaches holdUntilY, so the first arrivals can't
  //     slip past a bar that happened to start rotated out of the way. After
  //     that it turns at a constant `speed`.
  //   hub/centerOffset — the bar turns around `hub`, not its own middle: the
  //     body's center sits centerOffset along the bar from the hub, so one arm
  //     is longer than the other (length/2 + centerOffset vs length/2 - it).
  constructor(x, y, width, height, speed, color, pushMarbles = false, gate = null) {
    this.pushMarbles = pushMarbles;
    this.gate = gate;
    this.released = !gate;
    this.angle = gate ? gate.holdAngle : Math.random() * Math.PI * 2;
    this.speed = speed; // rad/sec, sign gives direction
    this.color = color;
    if (gate) {
      x = gate.hub.x + Math.cos(this.angle) * gate.centerOffset;
      y = gate.hub.y + Math.sin(this.angle) * gate.centerOffset;
    }
    this.body = physics.createRectBody(x, y, width, height, {
      isStatic: true,
      label: 'spinner',
      angle: this.angle,
      // Own category so race.js can let a marble that's been caught too long
      // slip through the bar alone (see FINISH.maxCatchMs).
      ...(gate ? { collisionFilter: { category: GATE_BAR_CATEGORY, mask: 0xffffffff } } : {}),
    });
  }

  update(deltaMs, leadY = -Infinity) {
    if (!this.released) {
      if (leadY < this.gate.holdUntilY) return;
      this.released = true;
    }
    this.angle += this.speed * (deltaMs / 1000);
    if (this.gate) {
      const { hub, centerOffset } = this.gate;
      physics.setBodyPosition(
        this.body,
        { x: hub.x + Math.cos(this.angle) * centerOffset, y: hub.y + Math.sin(this.angle) * centerOffset },
        this.pushMarbles
      );
    }
    physics.setBodyAngle(this.body, this.angle, this.pushMarbles);
  }
}

// Four-bladed windmill: four rectangles radiating from one pivot (a "+"),
// all rotating together as one compound static body.
export class Windmill4 {
  constructor(x, y, armLength, thickness, speed, color, surge = 0, surgePeriodMs = 4000, activateAtY = -Infinity) {
    // Stays still until the first marble reaches activateAtY, then spins.
    this.activateAtY = activateAtY;
    this.active = false;
    this.angle = Math.PI / 4;
    this.speed = speed;
    // Speed swings between speed*(1-surge) and speed*(1+surge) over
    // surgePeriodMs, so the blades alternately crawl and whip around.
    this.surge = surge;
    this.surgePeriodMs = surgePeriodMs;
    this.clock = 0;
    this.color = color;
    const parts = [0, 1, 2, 3].map((i) => {
      const a = (i * Math.PI) / 2;
      return physics.createRectBody(
        x + Math.cos(a) * (armLength / 2),
        y + Math.sin(a) * (armLength / 2),
        armLength,
        thickness,
        { angle: a, label: 'spinner' }
      );
    });
    this.body = Matter.Body.create({ parts, isStatic: true, label: 'spinner' });
    Matter.Body.setPosition(this.body, { x, y });
    physics.setBodyAngle(this.body, this.angle);
  }

  update(deltaMs, leadY = -Infinity) {
    if (!this.active) {
      if (leadY < this.activateAtY) return;
      this.active = true;
    }
    this.clock += deltaMs;
    const factor = 1 + this.surge * Math.sin((this.clock / this.surgePeriodMs) * Math.PI * 2);
    this.angle += this.speed * factor * (deltaMs / 1000);
    physics.setBodyAngle(this.body, this.angle);
  }
}
