import { COLORS } from './config.js';

let particles = [];

export function spawnSpark(x, y, color = COLORS.spark, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: 300 + Math.random() * 200,
      color,
      size: 1.5 + Math.random() * 2,
    });
  }
}

export function update(deltaMs) {
  particles.forEach((p) => {
    p.x += p.vx * (deltaMs / 16.6);
    p.y += p.vy * (deltaMs / 16.6);
    p.life += deltaMs;
  });
  particles = particles.filter((p) => p.life < p.maxLife);
}

export function draw(ctx) {
  particles.forEach((p) => {
    const alpha = 1 - p.life / p.maxLife;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}
