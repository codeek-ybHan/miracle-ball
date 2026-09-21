import * as physics from '../physics.js';

export class Spinner {
  constructor(x, y, width, height, speed, color) {
    this.angle = Math.random() * Math.PI * 2;
    this.speed = speed; // rad/sec, sign gives direction
    this.color = color;
    this.body = physics.createRectBody(x, y, width, height, {
      isStatic: true,
      label: 'spinner',
      angle: this.angle,
    });
  }

  update(deltaMs) {
    this.angle += this.speed * (deltaMs / 1000);
    physics.setBodyAngle(this.body, this.angle);
  }
}
