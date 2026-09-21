import * as physics from './physics.js';
import * as map from './map.js';
import * as particleManager from './particleManager.js';
import * as camera from './camera.js';
import { Marble } from './entities/marble.js';
import {
  GOAL_Y,
  BUMPER_FLASH_MS,
  MAGNET_RADIUS,
  MAGNET_ATTRACT_FORCE,
  MAGNET_REPEL_FORCE,
  MAGNET_CYCLE_MS,
  MAGNET_REPEL_MS,
  TRAMPOLINE_WIDTH,
  TRAMPOLINE_THICKNESS,
  TRAMPOLINE_TRIGGER_RATIO,
  TRAMPOLINE_TRIGGER_MIN,
  TRAMPOLINE_MAX_WAIT_MS,
  TRAMPOLINE_LAUNCH_SPEED,
  MARBLE_RADIUS,
  MARBLE_MAX_SPEED,
  COLORS,
} from './config.js';

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class Race {
  constructor(names) {
    physics.initPhysics();
    camera.configureBaseZoom();

    const course = map.createCourse();
    this.walls = course.bodies;
    this.spinners = course.spinners;
    this.windZones = course.windZones;
    this.magnets = course.magnets;
    this.magnetClock = 0;
    physics.addBodies(this.walls);

    const spawnCenterX = map.centerX(30);
    const spawnHalfWidth = map.tubeHalfWidthAt(30);
    const order = shuffle(names);
    this.marbles = order.map(
      (name, i) => new Marble(name, i, order.length, spawnCenterX, spawnHalfWidth)
    );
    physics.addBodies(this.marbles.map((m) => m.body));

    this.finishOrder = [];

    this.registerCollisionHandlers();
  }

  registerCollisionHandlers() {
    physics.onCollisionStart((pairs) => {
      pairs.forEach(({ bodyA, bodyB }) => {
        const labels = [bodyA.label, bodyB.label];
        if (!labels.includes('marble')) return;
        const other = bodyA.label === 'marble' ? bodyB : bodyA;

        if (other.label === 'bumper') {
          other.plugin.flashUntil = performance.now() + BUMPER_FLASH_MS;
          particleManager.spawnSpark(other.position.x, other.position.y, COLORS.bumper);
        } else if (other.label === 'peg') {
          other.plugin.hitAt = performance.now();
          particleManager.spawnSpark(other.position.x, other.position.y, COLORS.peg, 5);
        } else if (other.label === 'spinner') {
          const marbleBody = bodyA.label === 'marble' ? bodyA : bodyB;
          particleManager.spawnSpark(marbleBody.position.x, marbleBody.position.y, COLORS.spinner, 10);
        } else if (other.label === 'trampoline') {
          // Just a small "landed" flash here — the actual group launch is
          // decided in checkTrampolines() once enough racers are resting.
          other.plugin.flashUntil = performance.now() + BUMPER_FLASH_MS;
          particleManager.spawnSpark(other.position.x, other.position.y, COLORS.trampoline, 6);
        }
      });
    });
  }

  update(deltaMs) {
    this.spinners.forEach((s) => s.update(deltaMs));
    this.magnetClock += deltaMs;
    this.marbles.forEach((m) => {
      if (m.finished) return;
      m.jitter();
      this.applyWindZones(m);
      this.applyMagnets(m);
    });
    // Matter's collision check is discrete: it only looks at where a body
    // ends up after a step, never the path it swept to get there. The speed
    // cap below assumes a ~16.7ms (60fps) step, but main.js's rAF loop can
    // hand us a delta up to 50ms after a lag spike — feeding that whole
    // chunk into one Engine.update makes a fast marble's single-step
    // displacement 2-3x what the cap was sized for, punching clean through
    // wall/peg thickness. Splitting into fixed-size sub-steps (and
    // re-clamping speed before each one) keeps every individual Matter step
    // within the margin the cap was designed around, regardless of how
    // large the real frame delta was.
    const FIXED_STEP_MS = 1000 / 60;
    let remaining = deltaMs;
    while (remaining > 0) {
      const dt = Math.min(remaining, FIXED_STEP_MS);
      this.clampSpeeds();
      physics.step(dt);
      remaining -= dt;
    }
    this.clampSpeeds();
    particleManager.update(deltaMs);
    this.checkTrampolines(deltaMs);

    this.marbles.forEach((m) => {
      if (!m.finished && m.body.position.y > GOAL_Y) {
        m.finished = true;
        m.rank = this.finishOrder.length + 1;
        this.finishOrder.push(m);
        particleManager.spawnSpark(m.body.position.x, m.body.position.y, m.color, 36);
        particleManager.spawnSpark(m.body.position.x, m.body.position.y, COLORS.spark, 20);
      }
    });

    // Once everyone's finished the camera stops tracking anyone — the loop
    // keeps running (so spinners/particles/settling marbles keep animating
    // instead of freezing), but a finished marble's body is no longer
    // meaningful to follow, so the view just holds its last position.
    if (!this.isFinished()) {
      const leader = this.marbles
        .filter((m) => !m.finished)
        .sort((a, b) => b.body.position.y - a.body.position.y)[0];
      if (leader) camera.follow(leader.body.position.x, leader.body.position.y);
    }

    camera.update(deltaMs);
  }

  clampSpeeds() {
    this.marbles.forEach((m) => {
      const v = m.body.velocity;
      const speed = Math.hypot(v.x, v.y);
      if (speed > MARBLE_MAX_SPEED) {
        const scale = MARBLE_MAX_SPEED / speed;
        physics.setBodyVelocity(m.body, { x: v.x * scale, y: v.y * scale });
      }
    });
  }

  applyWindZones(marble) {
    const y = marble.body.position.y;
    this.windZones.forEach((zone) => {
      if (y >= zone.yStart && y <= zone.yEnd) {
        physics.applyForceToBody(marble.body, { x: 0, y: zone.forceY });
      }
    });
  }

  // Most of the cycle pulls marbles in toward the magnet; a short tail end
  // of the cycle pushes them back out instead — so a marble passing through
  // gets tugged off its line and then flung out, rather than ever settling
  // at the center (which is also why the pull force stays modest relative
  // to gravity: it can nudge, never hold).
  isMagnetRepelling() {
    return this.magnetClock % MAGNET_CYCLE_MS >= MAGNET_CYCLE_MS - MAGNET_REPEL_MS;
  }

  applyMagnets(marble) {
    if (this.magnets.length === 0) return;
    const repelling = this.isMagnetRepelling();
    this.magnets.forEach((magnet) => {
      const dx = magnet.x - marble.body.position.x;
      const dy = magnet.y - marble.body.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1 || dist > MAGNET_RADIUS) return;
      const falloff = 1 - dist / MAGNET_RADIUS;
      const strength = (repelling ? -MAGNET_REPEL_FORCE : MAGNET_ATTRACT_FORCE) * falloff;
      physics.applyForceToBody(marble.body, { x: (dx / dist) * strength, y: (dy / dist) * strength });
    });
  }

  // Recomputes, every frame, which racers are currently resting on top of
  // each trampoline (position + near-zero vertical speed) rather than
  // tracking touches over time — self-correcting if a marble rolls off the
  // side, so there's no separate "left the zone" bookkeeping to get wrong.
  // Once enough are resting at once, they all launch together and the
  // platform is removed for good.
  checkTrampolines(deltaMs) {
    this.walls.forEach((body) => {
      if (body.label !== 'trampoline' || body.plugin.triggered) return;
      if (body.plugin.requiredCount === null) {
        body.plugin.requiredCount = Math.max(
          TRAMPOLINE_TRIGGER_MIN,
          Math.ceil(this.marbles.length * TRAMPOLINE_TRIGGER_RATIO)
        );
      }

      const halfW = TRAMPOLINE_WIDTH / 2 - 4;
      const topY = body.position.y - TRAMPOLINE_THICKNESS / 2;
      const restY = topY - MARBLE_RADIUS;
      // Zone covers the platform's *entire* depth (top to well past the
      // bottom), not just a thin band near the top — a marble arriving with
      // real velocity can penetrate past a narrow "near the top" zone in a
      // single step or two before Matter fully resolves the overlap, and
      // once past a narrow zone it would never be caught again and would
      // just keep sinking under gravity. Catching it anywhere in this wider
      // band and snapping it straight to the resting position removes that
      // gap entirely, regardless of how deep it got before this check ran.
      const resting = this.marbles.filter((m) => {
        if (m.finished) return false;
        const dx = m.body.position.x - body.position.x;
        const dy = m.body.position.y - topY;
        return Math.abs(dx) < halfW && dy > -(MARBLE_RADIUS + 4) && dy < TRAMPOLINE_THICKNESS + MARBLE_RADIUS + 30;
      });

      // Pin resting marbles exactly at the surface every frame instead of
      // trusting Matter's resting-contact resolution to hold them there —
      // under constant gravity a body resting on another for many frames
      // (marbles can wait here up to TRAMPOLINE_MAX_WAIT_MS) drifts deeper
      // each step until it ends up embedded in, or through, the platform.
      // Explicitly locking position/velocity removes the drift entirely.
      resting.forEach((m) => {
        physics.setBodyPosition(m.body, { x: m.body.position.x, y: restY });
        physics.setBodyVelocity(m.body, { x: 0, y: 0 });
      });

      // Most marbles fall past the platform without ever landing on it (it's
      // narrower than the tube), so the group quota often can't be reached —
      // whoever HAS been waiting still launches after TRAMPOLINE_MAX_WAIT_MS
      // rather than sitting there for the rest of the race.
      body.plugin.waitMs = resting.length > 0 ? body.plugin.waitMs + deltaMs : 0;

      if (resting.length >= body.plugin.requiredCount || (resting.length > 0 && body.plugin.waitMs >= TRAMPOLINE_MAX_WAIT_MS)) {
        this.triggerTrampoline(body, resting);
      }
    });
  }

  triggerTrampoline(body, resting) {
    body.plugin.triggered = true;
    resting.forEach((m) => {
      const spread = (Math.random() - 0.5) * TRAMPOLINE_LAUNCH_SPEED;
      physics.setBodyVelocity(m.body, { x: spread, y: -TRAMPOLINE_LAUNCH_SPEED });
    });
    particleManager.spawnSpark(body.position.x, body.position.y, COLORS.trampoline, 30);
    particleManager.spawnSpark(body.position.x, body.position.y, COLORS.spark, 16);
    physics.removeBody(body);
    this.walls = this.walls.filter((w) => w !== body);
  }

  isFinished() {
    return this.finishOrder.length === this.marbles.length;
  }

  getUnfinishedRanking() {
    return this.marbles.filter((m) => !m.finished).sort((a, b) => b.body.position.y - a.body.position.y);
  }

  getFinalRanking() {
    return this.finishOrder;
  }
}
