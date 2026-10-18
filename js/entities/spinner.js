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

// Four-bladed windmill: four rectangles radiating from one pivot (a "+"),
// all rotating together as one compound static body.
export class Windmill4 {
  constructor(x, y, armLength, thickness, speed, color) {
    this.angle = Math.random() * Math.PI * 2;
    this.speed = speed;
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

  update(deltaMs) {
    this.angle += this.speed * (deltaMs / 1000);
    physics.setBodyAngle(this.body, this.angle);
  }
}
