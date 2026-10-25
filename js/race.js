import * as physics from './physics.js';
import * as map from './map.js';
import * as particleManager from './particleManager.js';
import * as camera from './camera.js';
import { Marble } from './entities/marble.js';
import { GATE_BAR_CATEGORY } from './entities/spinner.js';
import {
  FINISH,
  WALL_THICKNESS,
  GOAL_Y,
  BUMPER_FLASH_MS,
  MAGNET_RADIUS,
  MAGNET_ATTRACT_FORCE,
  MAGNET_REPEL_FORCE,
  MAGNET_CYCLE_MS,
  MAGNET_REPEL_MS,
  WIND_VORTEX_RADIUS,
  WIND_VORTEX_PULL_FORCE,
  WIND_VORTEX_SWIRL_FORCE,
  WIND_VORTEX_BURST_FORCE,
  WIND_VORTEX_CYCLE_MS,
  WIND_VORTEX_BURST_MS,
  BOUNCE_PAD_FLASH_MS,
  BOUNCE_PAD_LAUNCH_SPEED,
  WINDMILL_GATE_MAX_ANGULAR_SPEED,
  SLOW_ZONE_MAX_SPEED,
  SPEED_ZONE_MAX_SPEED,
  WALL_PUSH_MARGIN,
  WALL_PUSH_FORCE,
  MARBLE_RADIUS,
  MARBLE_MAX_SPEED,
  MARBLE_RESTITUTION,
  SLALOM_BOUNCE_MIN_SPEED,
  SLALOM_BOUNCE_SIDE_KICK,
  FUNNEL_RESTITUTION,
  FUNNEL_ZONE_MARGIN,
  FUNNEL_MAX_SPEED,
  FUNNEL_SPEED_CAP_MARGIN,
  GATE_ZONE_MARGIN,
  COLORS,
  getThemeShape,
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
  constructor(names, themeId = 'dark') {
    physics.initPhysics();
    camera.configureBaseZoom();

    const course = map.createCourse(themeId);
    this.walls = course.bodies;
    this.spinners = course.spinners;
    // passedMarbles/disabled aren't part of the course data itself — they're
    // per-race state tracking how many marbles have fully crossed each zone
    // (see applySlowZones), so a zone burns out after the first 2 balls go
    // through it instead of punishing every leader for the whole race.
    this.speedZones = course.speedZones ?? [];
    this.slowZones = course.slowZones.map((zone) => ({ ...zone, passedMarbles: new Set(), disabled: false }));
    this.magnets = course.magnets;
    this.magnetClock = 0;
    this.windVortices = course.windVortices;
    this.vortexClock = 0;
    this.funnels = course.funnels;
    this.gates = course.gates;
    this.currentlySlowed = new Set();
    this.windmillGate = this.walls.find((b) => b.label === 'windmillGate');
    physics.addBodies(this.walls);

    // The dark course's hand-built opening (see map.js's createIntro) isn't
    // the winding tube, so wall-push must stay off inside it and marbles
    // spawn in its chute instead of across the tube's width.
    this.introEndY = course.introEndY ?? 0;
    const spawnCenterX = course.spawnCenterX ?? map.centerX(30);
    const spawnHalfWidth = map.tubeHalfWidthAt(30);
    const shape = getThemeShape(themeId);
    const order = shuffle(names);
    this.marbles = order.map(
      (name, i) => new Marble(name, i, order.length, spawnCenterX, spawnHalfWidth, shape, course.spawnCenterX !== undefined)
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
          // The finish bar keeps hitting the same marbles over and over, so
          // a spark burst per hit just litters the screen — no sparks there.
          if (other.collisionFilter.category !== GATE_BAR_CATEGORY) {
            particleManager.spawnSpark(marbleBody.position.x, marbleBody.position.y, COLORS.spinner, 10);
          }
        } else if (other.label === 'slalomPlank') {
          // A direct velocity kick (same reasoning as the bounce pad above)
          // rather than trusting restitution alone — a marble sliding down
          // the plank can hit it at a shallow, mostly-tangential angle with
          // very little velocity along the surface normal to actually
          // restitute off of, which is exactly the "sometimes sticks/slides
          // instead of bouncing" case this guarantees against on every touch.
          // The sideways component adds a random kick (both size and
          // direction) on top of whatever drift the marble already had,
          // instead of just carrying that drift through unchanged — that's
          // what makes consecutive hits scatter every which way rather than
          // always continuing in the same direction it was already going.
          const marbleBody = bodyA.label === 'marble' ? bodyA : bodyB;
          const vx = marbleBody.velocity.x;
          const vy = marbleBody.velocity.y;
          const kickDir = Math.random() < 0.5 ? -1 : 1;
          physics.setBodyVelocity(marbleBody, {
            x: vx * 0.5 + kickDir * (SLALOM_BOUNCE_SIDE_KICK + Math.random() * SLALOM_BOUNCE_SIDE_KICK),
            y: Math.min(-SLALOM_BOUNCE_MIN_SPEED, -Math.abs(vy) * 0.6),
          });
        } else if (other.label === 'windmillGate') {
          // Rigid and immovable until this exact moment — the first marble
          // to ever touch it is what wakes it up into a real dynamic body
          // (see map.js's createCourse for why), so the collision that
          // triggers this is also the collision that starts tipping it.
          if (!other.plugin.activated) {
            other.plugin.activated = true;
            physics.setBodyStatic(other, false);
            particleManager.spawnSpark(other.position.x, other.position.y, COLORS.windmill, 14);
          }
        } else if (other.label === 'bouncePad') {
          // A direct velocity kick, not restitution, is what actually sends
          // the marble flying (see config.js's BOUNCE_PAD_LAUNCH_SPEED for
          // why). The sideways component needs to be strong and random-
          // signed, not just a fraction of incoming drift — the wind vortex
          // right above centers every marble before it ever reaches the pad,
          // so incoming vx here is nearly always tiny (~0-2px/frame), and a
          // weak kick just sends the marble straight back down onto the same
          // spot it launched from. Measured in practice: a full flight
          // (launch to landing) takes ~80 frames, and the pad is only
          // ~155px wide, so anything under ~1.2px/frame of sideways drift
          // reliably re-lands ON the pad — re-triggering the launch and
          // repeating, sometimes several times in a row, which is what was
          // blowing up the rank spread through this section. A forced
          // 3-6px/frame push in a random direction clears the pad's width
          // several times over within that flight time, so a marble escapes
          // on the first bounce essentially every time.
          const marbleBody = bodyA.label === 'marble' ? bodyA : bodyB;
          const pushDir = Math.random() < 0.5 ? -1 : 1;
          const spread = marbleBody.velocity.x * 0.3 + pushDir * (3 + Math.random() * 3);
          physics.setBodyVelocity(marbleBody, { x: spread, y: -BOUNCE_PAD_LAUNCH_SPEED });
          other.plugin.flashUntil = performance.now() + BOUNCE_PAD_FLASH_MS;
          // Drives the sink-then-spring mat animation in renderer.js — purely
          // visual, doesn't feed back into physics at all.
          other.plugin.hitAt = performance.now();
          particleManager.spawnSpark(other.position.x, other.position.y, COLORS.bouncePad, 18);
        }
      });
    });
  }

  update(deltaMs) {
    // Matter's collision check is discrete: it only looks at where a body
    // ends up after a step, never the path it swept to get there, and every
    // force/speed cap in here is tuned for a 60fps step. The rAF rate is not
    // the same everywhere (Safari/ProMotion/low-power mode hand us anywhere
    // from ~8ms to 50ms), so the whole simulation — forces, spinner/finish-bar
    // motion, speed caps, the physics step itself — advances in fixed
    // 1/60s ticks driven by an accumulator, never by the raw frame delta.
    // Same course, same behaviour on every browser and refresh rate, and a
    // marble's per-step displacement never exceeds what the caps were sized
    // for (which is what lets one punch through the finish bar or a wall).
    const FIXED_STEP_MS = 1000 / 60;
    const MAX_STEPS_PER_FRAME = 5;
    this.simAcc = Math.min((this.simAcc ?? 0) + Math.max(deltaMs, 0), FIXED_STEP_MS * MAX_STEPS_PER_FRAME);
    while (this.simAcc >= FIXED_STEP_MS) {
      this.simAcc -= FIXED_STEP_MS;
      this.fixedStep(FIXED_STEP_MS);
    }
    this.clampSpeeds();
    // Leftover fraction of a tick, so rendering can interpolate (see
    // Marble.getPosition).
    const alpha = this.simAcc / FIXED_STEP_MS;
    this.marbles.forEach((m) => {
      m.renderAlpha = alpha;
    });
    particleManager.update(deltaMs);

    this.marbles.forEach((m) => {
      if (!m.finished && m.body.position.y > GOAL_Y) {
        m.finished = true;
        // Out of the race: leave the marbles' collision category (0x0002) so
        // nobody racing can bump into, or be blocked by, a finished marble —
        // it still rests on the walls/floor like before.
        m.body.collisionFilter.category = 0x0004;
        m.body.collisionFilter.mask = 0x0001;
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
      if (leader) {
        const p = leader.getPosition();
        camera.follow(p.x, p.y, leader.body.velocity.x, leader.body.velocity.y);
      }
    }

    camera.update(deltaMs);
  }

  fixedStep(dt) {
    const leadY = this.marbles.reduce((y, m) => Math.max(y, m.body.position.y), -Infinity);
    this.spinners.forEach((s) => s.update(dt, leadY));
    this.magnetClock += dt;
    this.vortexClock += dt;
    this.releaseOverCaught(dt);
    this.marbles.forEach((m) => {
      if (m.finished) return;
      m.jitter();
      this.applyMagnets(m);
      this.applyWindVortices(m);
      this.applyWallPush(m);
      this.applyFunnelDamping(m);
    });
    // Live 1st/2nd place, recomputed fresh every tick — applySlowZones needs
    // to know exactly who's out front *right now*, since the whole point is
    // that it only ever pushes back on whoever that is at this instant.
    this.applySlowZones(this.getUnfinishedRanking().slice(0, 2));
    this.clampSpeeds();
    this.rescueEscaped();
    this.marbles.forEach((m) => m.snapshot());
    physics.step(dt);
  }

  // Last-resort net for a marble that tunneled through a wall (or went NaN)
  // despite the fixed step: it would otherwise fall straight down outside
  // the tube past every obstacle. Put it back on the tube's centerline at the
  // same height so it still has to run the rest of the course.
  rescueEscaped() {
    // Finish slot: once a marble is below the funnel's throat it has to be in
    // the slot. One squeezed between the turning bar and the funnel plank can
    // get pushed out the other side and would fall down beside the slot, past
    // the finish — drop it back in just above the throat instead.
    const bar = this.spinners.find((s) => s.gate);
    const slotX = bar && bar.gate.hub.x + (1.1 + FINISH.slotWidth / 2) * FINISH.unit;
    this.marbles.forEach((m) => {
      if (m.finished) return;
      const { x, y } = m.body.position;
      if (bar && y > bar.gate.hub.y + 30 && Math.abs(x - slotX) > FINISH.slotWidth * FINISH.unit + 20) {
        physics.setBodyPosition(m.body, { x: slotX, y: bar.gate.hub.y - 60 });
        physics.setBodyVelocity(m.body, { x: 0, y: 0 });
        return;
      }
      if (y < this.introEndY) return;
      const limit = map.tubeHalfWidthAt(y) + WALL_THICKNESS + 40;
      if (Number.isFinite(x + y) && Math.abs(x - map.centerX(y)) <= limit) return;
      const safeY = Number.isFinite(y) ? y : this.introEndY + 50;
      physics.setBodyPosition(m.body, { x: map.centerX(safeY), y: safeY });
      physics.setBodyVelocity(m.body, { x: 0, y: 0 });
    });
  }

  // Finish bar safety valve: a marble that keeps getting thrown back by the
  // bar for FINISH.maxCatchMs stops colliding with it and drops through.
  releaseOverCaught(deltaMs) {
    const bar = this.spinners.find((s) => s.gate);
    if (!bar || !bar.released) return;
    this.marbles.forEach((m) => {
      if (m.finished || m.body.position.y < bar.gate.holdUntilY) return;
      m.caughtMs = (m.caughtMs ?? 0) + deltaMs;
      if (m.caughtMs > FINISH.maxCatchMs) m.body.collisionFilter.mask &= ~GATE_BAR_CATEGORY;
    });
  }

  clampSpeeds() {
    this.marbles.forEach((m) => {
      // Checked fresh every call (this runs before AND after every single
      // physics substep, not just once per rendered frame) — it's the only
      // thing that actually catches the bad velocity Matter's own collision
      // resolution can produce right at a funnel/gate, in the same substep
      // it's produced, before gravity or a render has a chance to carry it
      // anywhere visible. Deliberately its OWN (much tighter) zone check,
      // not isInBounceDampedZone's — see FUNNEL_SPEED_CAP_MARGIN's comment
      // for why reusing that wider, safety-padded zone here was actively
      // fighting gravity for marbles nowhere near the plank.
      let cap = this.isInSpeedCapZone(m) ? FUNNEL_MAX_SPEED : MARBLE_MAX_SPEED;
      const my = m.body.position.y;
      this.speedZones.forEach((z) => {
        if (my >= z.yStart && my <= z.yEnd) cap = Math.min(cap, z.maxSpeed ?? SPEED_ZONE_MAX_SPEED);
      });
      const v = m.body.velocity;
      const speed = Math.hypot(v.x, v.y);
      if (speed > cap) {
        const scale = cap / speed;
        physics.setBodyVelocity(m.body, { x: v.x * scale, y: v.y * scale });
      }
    });
    if (this.windmillGate && !this.windmillGate.isStatic) {
      // Re-pin the center every step instead of trusting a Matter.Constraint
      // for this (see map.js's createCourse for why that turned out to be
      // unreliable under continuous rotation) — zeroing only the LINEAR
      // velocity and resetting position back to the pivot, while leaving
      // angularVelocity alone, is what keeps it purely rotating in place
      // like a real seesaw instead of also falling.
      physics.setBodyPosition(this.windmillGate, this.windmillGate.plugin.pivot);
      physics.setBodyVelocity(this.windmillGate, { x: 0, y: 0 });
      // See config.js's WINDMILL_GATE_MAX_ANGULAR_SPEED.
      if (Math.abs(this.windmillGate.angularVelocity) > WINDMILL_GATE_MAX_ANGULAR_SPEED) {
        const sign = Math.sign(this.windmillGate.angularVelocity);
        physics.setBodyAngularVelocity(this.windmillGate, sign * WINDMILL_GATE_MAX_ANGULAR_SPEED);
      }
    }
  }

  // Unlike every other force zone here, this only ever touches the marbles
  // it's handed — the caller decides who that is (the live top 2), so the
  // rubber-band is a property of *rank*, not of merely passing through a
  // patch of the course the way the old blanket updraft was.
  //
  // This clamps velocity directly instead of applying a force. A force
  // strong enough to feel dramatic can — depending on how fast the marble
  // happened to be going when it entered — momentarily overpower gravity
  // and reverse it, and that turned out to be a real trap: normally a
  // stalled leader gets overtaken and drops out of the top 2, lifting the
  // effect, but that escape doesn't exist once a marble is the only one
  // left racing, or when several marbles hovering together keep trading the
  // "leader" penalty back and forth fast enough that no single one is ever
  // continuously slowed long enough for a timeout to save it — several
  // guarded designs along those lines still produced races that took
  // minutes or never finished. Clamping the fall speed down to
  // SLOW_ZONE_MAX_SPEED instead has no such failure mode: velocity only
  // ever gets pulled down toward that cap, never pushed negative, so
  // crossing the zone is always bounded (zone length / cap, at worst) no
  // matter how slow a marble was already going when it arrived.
  applySlowZones(leaders) {
    // Each zone only gets to slow the first 2 marbles that ever cross it —
    // once a marble has fully passed (cleared yEnd, regardless of whether it
    // was actually a leader while inside), it's counted, and after 2 the
    // zone permanently stops clamping anyone. Tracked across ALL marbles
    // (not just leaders) since "passed through" is about the ball's
    // position, not whether the slow applied to it.
    this.marbles.forEach((marble) => {
      if (marble.finished) return;
      this.slowZones.forEach((zone) => {
        if (zone.disabled) return;
        if (marble.body.position.y > zone.yEnd && !zone.passedMarbles.has(marble)) {
          zone.passedMarbles.add(marble);
          if (zone.passedMarbles.size >= 2) zone.disabled = true;
        }
      });
    });

    // Who's actually being clamped this frame — not just "is a leader", but
    // "is a leader AND currently inside a zone" — so the renderer can draw
    // an unmistakable visual on exactly the marble(s) the slow is touching,
    // instead of leaving it to look like the whole tinted zone affects
    // whoever drifts through it.
    this.currentlySlowed = new Set();
    leaders.forEach((marble) => {
      this.slowZones.forEach((zone) => {
        if (zone.disabled) return;
        const y = marble.body.position.y;
        if (y < zone.yStart || y > zone.yEnd) return;
        const v = marble.body.velocity;
        if (v.y > SLOW_ZONE_MAX_SPEED) {
          physics.setBodyVelocity(marble.body, { x: v.x, y: SLOW_ZONE_MAX_SPEED });
        }
        this.currentlySlowed.add(marble);
      });
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

  // Same pull-then-burst cycle shape as the magnet, but the "pulling in"
  // phase also gets a tangential push (perpendicular to the line toward the
  // center) on top of the radial one — that combination is what makes a
  // marble curve inward along a spiral instead of just sliding straight at
  // the center, so it reads as being caught in a whirlwind rather than
  // yanked by a magnet.
  isWindVortexBursting() {
    return this.vortexClock % WIND_VORTEX_CYCLE_MS >= WIND_VORTEX_CYCLE_MS - WIND_VORTEX_BURST_MS;
  }

  applyWindVortices(marble) {
    if (this.windVortices.length === 0) return;
    const bursting = this.isWindVortexBursting();
    const y = marble.body.position.y;
    this.windVortices.forEach((vortex) => {
      // The actual center-alignment guarantee: detects an actual CROSSING
      // of the vortex's exact y this frame (this position vs. last frame's)
      // instead of checking "is y currently within some fixed band around
      // it" — a fixed-width band can still get jumped clean over in one
      // physics step by a marble moving fast, or one a burst has already
      // flung far off to the side (that first version of this method gated
      // the band check on overall distance, so a marble knocked far enough
      // sideways had distance > RADIUS even with a tiny dy, and sailed
      // through without ever being caught — the actual bug this replaces).
      // There's no way to cross the line itself without being seen on each
      // side of it, however far a lag spike's frame delta moves you.
      const prevY = marble.vortexPrevY === undefined ? y : marble.vortexPrevY;
      marble.vortexPrevY = y;
      if ((prevY < vortex.y && y >= vortex.y) || (prevY > vortex.y && y <= vortex.y)) {
        physics.setBodyPosition(marble.body, { x: vortex.x, y });
        physics.setBodyVelocity(marble.body, { x: 0, y: marble.body.velocity.y });
        return;
      }

      // Once a marble is past the vortex's y, leave it alone — this was the
      // other half of the same bug: a marble that had JUST been centered by
      // the snap above is still well inside RADIUS on the very next frame,
      // so without this it could immediately get caught by an outward burst
      // again right after crossing, with nothing left downstream to correct
      // it a second time (the snap above only fires once, exactly at the
      // crossing). The pull/swirl/burst below is only for marbles still
      // approaching from above.
      if (y >= vortex.y) return;

      const dx = vortex.x - marble.body.position.x;
      const dy = vortex.y - marble.body.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > WIND_VORTEX_RADIUS || dist < 1) return;

      const falloff = 1 - dist / WIND_VORTEX_RADIUS;
      if (bursting) {
        const strength = WIND_VORTEX_BURST_FORCE * falloff;
        physics.applyForceToBody(marble.body, { x: (-dx / dist) * strength, y: (-dy / dist) * strength });
        return;
      }
      const radialStrength = WIND_VORTEX_PULL_FORCE * falloff;
      const swirlStrength = WIND_VORTEX_SWIRL_FORCE * falloff;
      // Perpendicular to the (dx, dy) radial direction — rotates the pull
      // into a tangent, i.e. the swirl.
      const tx = -dy / dist;
      const ty = dx / dist;
      physics.applyForceToBody(marble.body, {
        x: (dx / dist) * radialStrength + tx * swirlStrength,
        y: (dy / dist) * radialStrength + ty * swirlStrength,
      });
    });
  }

  // Without this, a marble that ends up pressed against the curved tube
  // wall can just ride that curve for a long stretch — a flat, uninteresting
  // line, and an easy way to glide past obstacles that assume some lateral
  // drift. The push grows smoothly from nothing at WALL_PUSH_MARGIN away up
  // to full strength right at the wall, rather than snapping on/off, so it
  // reads as a gentle steer back toward the middle, not an invisible wall.
  applyWallPush(marble) {
    const { x, y } = marble.body.position;
    if (y < this.introEndY) return;
    const center = map.centerX(y);
    const halfWidth = map.tubeHalfWidthAt(y);
    const offsetFromCenter = x - center;
    const distToWall = halfWidth - Math.abs(offsetFromCenter) - MARBLE_RADIUS;
    if (distToWall >= WALL_PUSH_MARGIN) return;
    const falloff = 1 - Math.max(distToWall, 0) / WALL_PUSH_MARGIN;
    const direction = offsetFromCenter > 0 ? -1 : 1;
    physics.applyForceToBody(marble.body, { x: direction * WALL_PUSH_FORCE * falloff, y: 0 });
  }

  // Funnel walls and gate-row posts both steer marbles (into the narrow
  // gap, or into a lane) rather than launch them — but Matter always
  // resolves a collision's restitution as
  // Math.max(bodyA.restitution, bodyB.restitution), so neither the funnel
  // wall's nor the gate post's own restitution can ever make contact LESS
  // springy than the marble's own MARBLE_RESTITUTION. Zeroing the marble's
  // OWN restitution while it's within FUNNEL_ZONE_MARGIN of any funnel's y,
  // or GATE_ZONE_MARGIN of any gate row's y (restored the instant it
  // clears both), is the only lever that actually works given that rule —
  // see config.js's FUNNEL_RESTITUTION. The gate row needed this fix too:
  // direct simulation found a marble clipping one post at an angle could
  // catch the next post over before clearing the first, and at the
  // marble's normal 0.7 restitution that showed up as vx reversing sign —
  // and GAINING magnitude — three times within 6 frames, i.e. exactly the
  // side-to-side "spasm" bug, not the clean single deflection a lane
  // divider should give.
  //
  // This alone doesn't fully kill the funnel's bounce, though — direct
  // simulation (with realistic, jittery frame deltas, not a clean fixed
  // timestep) confirmed the marble's own restitution really was 0 at the
  // exact moment of contact, and yet the marble could still rebound at
  // full MARBLE_MAX_SPEED with its direction reversed, independent of both
  // incoming speed and how wide the gap was (tried doubling it — no
  // change). That rules out restitution AND simple tunneling as the
  // cause; what's left is Matter's own SAT collision-normal calculation
  // getting unstable for a circle contacting very close to a long, thin,
  // rotated rectangle's end — a known category of physics-engine glitch,
  // not something fixable by tuning restitution or geometry here. See
  // clampSpeeds() for the actual fix: capping speed specifically inside
  // this zone, checked fresh every physics substep (not just once per
  // frame here) so it catches the bad velocity the instant Matter produces
  // it, before it ever reaches a rendered frame.
  isInBounceDampedZone(marble) {
    const y = marble.body.position.y;
    const inFunnel = this.funnels.some((f) => Math.abs(y - f.y) <= FUNNEL_ZONE_MARGIN);
    const inGate = this.gates.some((g) => Math.abs(y - g.y) <= GATE_ZONE_MARGIN);
    return inFunnel || inGate;
  }

  // See config.js's FUNNEL_SPEED_CAP_MARGIN — a deliberately tighter check
  // than isInBounceDampedZone's, used only by clampSpeeds' active speed
  // brake. The gate side reuses GATE_ZONE_MARGIN as-is (60, already close
  // to the posts' own 80px-tall footprint, not padded nearly as wide as
  // the funnel's 120).
  isInSpeedCapZone(marble) {
    const y = marble.body.position.y;
    const nearFunnelWall = this.funnels.some((f) => Math.abs(y - f.y) <= FUNNEL_SPEED_CAP_MARGIN);
    const inGate = this.gates.some((g) => Math.abs(y - g.y) <= GATE_ZONE_MARGIN);
    return nearFunnelWall || inGate;
  }

  applyFunnelDamping(marble) {
    const damped = this.isInBounceDampedZone(marble);
    physics.setBodyRestitution(marble.body, damped ? FUNNEL_RESTITUTION : MARBLE_RESTITUTION);
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
