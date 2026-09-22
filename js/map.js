import * as physics from './physics.js';
import { Spinner } from './entities/spinner.js';
import {
  COURSE_WIDTH,
  COURSE_HEIGHT,
  S,
  WALL_THICKNESS,
  TUBE_HALF_WIDTH,
  TUBE_WIDTH_VARIATION,
  TUBE_WIDTH_PERIOD,
  WAVE_AMPLITUDE,
  WAVE_PERIOD,
  PEG_RADIUS,
  SPINNER_SPEED,
  SPINNER_LENGTH,
  WINDMILL_SPEED,
  WINDMILL_LENGTH,
  BUMPER_RADIUS,
  BUMPER_RESTITUTION,
  TRAMPOLINE_WIDTH,
  TRAMPOLINE_THICKNESS,
  TRAMPOLINE_RESTITUTION,
  TRAMPOLINE_FRICTION,
  BOUNCE_PAD_THICKNESS,
  BOUNCE_PAD_MARGIN,
  BOUNCE_PAD_RESTITUTION,
  BOUNCE_PAD_FRICTION,
  WIND_FORCE_Y,
  COLORS,
} from './config.js';

// The track's centerline snakes left/right as it descends, like a winding tube.
export function centerX(y) {
  return COURSE_WIDTH / 2 + WAVE_AMPLITUDE * Math.sin((y / WAVE_PERIOD) * Math.PI * 2);
}

// The tube's width also breathes wider/narrower as it descends (out of phase
// with the left-right wave), instead of staying a constant width the whole
// way — this is the "road itself", not just the winding route through it.
export function tubeHalfWidthAt(y) {
  return TUBE_HALF_WIDTH + TUBE_WIDTH_VARIATION * Math.sin((y / TUBE_WIDTH_PERIOD) * Math.PI * 2);
}

function tubeChain(side, bodies) {
  // Sampling resolution is tied to WAVE_PERIOD (28 samples/cycle, matching
  // the original 1400/50 ratio) rather than a fixed pixel step — since
  // WAVE_PERIOD scales with S, this keeps both curve smoothness (safe wall
  // angles) AND total segment count roughly constant regardless of S. Long
  // segments are only safe from tunneling because MARBLE_MAX_SPEED is kept
  // well under WALL_THICKNESS + marble diameter (see config.js) — Matter's
  // collision detection is discrete (checked only at each step's resolved
  // position, not swept along the path), so speed is what actually bounds
  // whether a fast marble can skip clean through a thin wall in one step.
  const sampleStep = WAVE_PERIOD / 28;
  const points = [];
  for (let y = 0; y <= COURSE_HEIGHT; y += sampleStep) {
    points.push({ x: centerX(y) + side * tubeHalfWidthAt(y), y });
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) + 2;
    const angle = Math.atan2(dy, dx);
    bodies.push(
      physics.createRectBody((a.x + b.x) / 2, (a.y + b.y) / 2, length, WALL_THICKNESS, {
        isStatic: true,
        label: 'wall',
        angle,
      })
    );
  }
}

// Shared spacing formula so pegField's stagger phases always match what
// pegRow will independently compute for the same row.
function pegSpacingAt(y, count) {
  const margin = 42;
  const half = tubeHalfWidthAt(y);
  const left = centerX(y) - half + margin;
  const right = centerX(y) + half - margin;
  return { left, right, spacing: (right - left) / (count - 1) };
}

function pegRow(y, count, staggerPx, bodies) {
  const { left, right, spacing } = pegSpacingAt(y, count);
  for (let i = 0; i < count; i++) {
    const x = left + i * spacing + staggerPx;
    if (x < left - 5 || x > right + 5) continue;
    const peg = physics.createCircleBody(x, y, PEG_RADIUS, {
      isStatic: true,
      label: 'peg',
    });
    peg.plugin = { hitAt: -Infinity };
    bodies.push(peg);
  }
}

function pegField(startY, rowSpacing, rowCount, count, bodies) {
  for (let r = 0; r < rowCount; r++) {
    const y = startY + r * rowSpacing;
    const { spacing } = pegSpacingAt(y, count);
    // Four alternating offsets (not two) so there's no single "empty lane"
    // that lines up the same way on every row — with only two alternating
    // offsets, a marble falling with little sideways drift can thread the
    // exact same gap on every row and never touch a peg at all. The jump
    // between consecutive rows (0 -> half a spacing) is a full half-step
    // rather than a third, so the zigzag reads as a much sharper side-to-side
    // pattern; the two in-between phases (a quarter and three-quarters) still
    // fill out a 4-row cycle so no straight lane opens up every other row.
    const phases = [0, spacing / 2, spacing / 4, (3 * spacing) / 4];
    pegRow(y, count, phases[r % phases.length], bodies);
  }
}

// Trampoline: a flat static platform, kept narrow enough (with plenty of
// margin) that it never gets close to either tube wall regardless of local
// width, so it's just an island obstacle like the bumper. Low restitution +
// high friction so marbles land and settle instead of bouncing — the actual
// launch is a deliberate group event handled in race.js once enough racers
// are resting on it at once.
function trampoline(y, offsetRatio, angle, bodies) {
  const body = physics.createRectBody(centerX(y) + offsetRatio * tubeHalfWidthAt(y), y, TRAMPOLINE_WIDTH, TRAMPOLINE_THICKNESS, {
    isStatic: true,
    restitution: TRAMPOLINE_RESTITUTION,
    friction: TRAMPOLINE_FRICTION,
    angle,
    label: 'trampoline',
  });
  body.plugin = { flashUntil: 0, triggered: false, requiredCount: null, waitMs: 0 };
  bodies.push(body);
}

// Bounce pad: fires on every single touch instead of waiting for a group to
// gather like the trampoline does. The body itself only needs a modest
// restitution — the actual launch is a direct velocity kick applied in
// race.js's collision handler (see BOUNCE_PAD_LAUNCH_SPEED in config.js for
// why). Width is sized off the local tube half-width (not a fixed constant
// like the trampoline's) so it spans nearly the full passage and catches
// essentially everyone who comes through here, rather than being a narrow
// island some marbles just fall past.
function bouncePad(y, bodies) {
  const width = 2 * (tubeHalfWidthAt(y) - BOUNCE_PAD_MARGIN);
  const body = physics.createRectBody(centerX(y), y, width, BOUNCE_PAD_THICKNESS, {
    isStatic: true,
    restitution: BOUNCE_PAD_RESTITUTION,
    friction: BOUNCE_PAD_FRICTION,
    label: 'bouncePad',
  });
  body.plugin = { flashUntil: 0, hitAt: -Infinity };
  bodies.push(body);
}

function bumper(y, offsetRatio, bodies) {
  const body = physics.createCircleBody(centerX(y) + offsetRatio * tubeHalfWidthAt(y), y, BUMPER_RADIUS, {
    isStatic: true,
    restitution: BUMPER_RESTITUTION,
    label: 'bumper',
  });
  body.plugin = { flashUntil: 0 };
  bodies.push(body);
}

// A converging pair of angled walls. Their outer ends reach out toward the
// tube wall (by `overlap`) and the inner tips leave a fixed `innerGap`
// regardless of the local tube width, so the passage never becomes too tight
// for a marble even where the tube is narrowed.
//
// `overlap` defaults to 0 (not actually reaching the tube wall) rather than
// overlapping it, even though that can leave a narrow gap for a marble to
// slip past ungated right along the wall. A positive overlap seems safer at
// a glance, but wherever the tube's own curve is bending across the plank's
// vertical span (which happens anywhere along this winding course), a
// straight plank extended out to meet it can end up crossing the curved
// wall at a bad angle instead of running alongside it — carving out a tiny
// dead-end corner pocket right where they cross. A marble landing there is
// genuinely stuck: normal forces from the two nearly-perpendicular surfaces
// hold it in place regardless of friction (confirmed by simulating it with
// friction set to zero and it still didn't budge), so it just sits there
// jittering in place forever — looking like gravity stopped affecting it —
// instead of ever finishing. Letting a rare marble slip past ungated is a
// far smaller cost than the race being able to freeze entirely.
function funnelPair(y, angle, innerGap, bodies, overlap = 0) {
  const cos = Math.cos(angle);
  const outerReach = tubeHalfWidthAt(y) + overlap;
  const innerGapHalf = innerGap / 2;
  const halfLength = (outerReach - innerGapHalf) / (2 * cos);
  const offset = innerGapHalf + halfLength * cos;
  const cx = centerX(y);
  bodies.push(
    physics.createRectBody(cx - offset, y, halfLength * 2, 14, { isStatic: true, label: 'wall', angle })
  );
  bodies.push(
    physics.createRectBody(cx + offset, y, halfLength * 2, 14, { isStatic: true, label: 'wall', angle: -angle })
  );
}

// A single tilted plank that stops well short of the tube wall (a real open
// gap, not just a narrow one — an angled plank meeting a wall almost head-on
// forms a sealed wedge there, which is a trap regardless of how much it
// "overlaps") and crosses past the centerline on the inner end, so
// consecutive alternating planks always overlap in the middle and no marble
// can fall straight through untouched.
function slalomPlank(y, angle, side, bodies) {
  const outerReach = tubeHalfWidthAt(y) - 60;
  const innerCross = 20;
  const cos = Math.cos(angle);
  const length = (outerReach + innerCross) / cos;
  const offset = (side * (outerReach - innerCross)) / 2;
  bodies.push(
    physics.createRectBody(centerX(y) + offset, y, length, 14, {
      isStatic: true,
      label: 'wall',
      angle: side * angle,
    })
  );
}

// A rotating spinner/windmill sweeps a full circle of radius = half its
// length around its own center as it turns, so however long we'd LIKE it to
// be, it must never be long enough (combined with how far off-center it
// sits) to sweep into the tube wall at its particular y — otherwise it would
// clip into a static wall on every rotation. This clamps the desired length
// down to whatever actually fits the local tube width, so obstacles can be
// made longer without needing to hand-place each one at a "wide" point.
function fittedSpinnerLength(y, desiredLength, offsetRatio) {
  const half = tubeHalfWidthAt(y);
  const centerOffset = Math.abs(offsetRatio) * half;
  const safety = 20;
  const maxHalfLength = Math.max(40, half - centerOffset - safety);
  return Math.min(desiredLength, maxHalfLength * 2);
}

export function createCourse() {
  const bodies = [];
  const spinners = [];
  const windZones = [];
  const magnets = [];
  const windVortices = [];

  // Winding tube boundary (replaces straight side walls); its width itself
  // also varies along the way, not just its left-right curve.
  tubeChain(-1, bodies);
  tubeChain(1, bodies);

  // 1. Peg field
  pegField(150 * S, 55 * S, 7, 5, bodies);

  // 2. Narrowing bottleneck funnel — tight enough that marbles have to
  // queue single-file, jostling for who gets through first.
  funnelPair(600 * S, 0.15, 20, bodies);

  // 3. Power bumper arena 1 (chaotic bounces, can undo a lead)
  bumper(800 * S, -0.52, bodies);
  bumper(800 * S, 0.52, bodies);
  bumper(920 * S, 0, bodies);

  // 4. Spinner gauntlet — mounted less off-center (0.22 instead of 0.32) than
  // you might expect for a "long" spinner, because fittedSpinnerLength() caps
  // each one's actual length by how much of the local tube width is left
  // once its own off-center mount is accounted for. At 0.32 the desired
  // length was already being clamped down hard (280 -> ~150-200 in
  // practice); pulling the mount in gives the bar enough headroom that the
  // longer SPINNER_LENGTH actually shows up instead of just getting cut off.
  [
    { y: 1080 * S, offsetRatio: -0.22, speed: SPINNER_SPEED },
    { y: 1220 * S, offsetRatio: 0.22, speed: -SPINNER_SPEED },
    { y: 1360 * S, offsetRatio: -0.22, speed: SPINNER_SPEED },
  ].forEach(({ y, offsetRatio, speed }) => {
    const length = fittedSpinnerLength(y, SPINNER_LENGTH, offsetRatio);
    spinners.push(new Spinner(centerX(y) + offsetRatio * tubeHalfWidthAt(y), y, length, 14, speed, COLORS.spinner));
  });

  // 5. Updraft zone: slows/reverses whoever is currently in front, lets others catch up
  windZones.push({ yStart: 1450 * S, yEnd: 1650 * S, forceY: WIND_FORCE_Y });

  // 5b. Wind vortex — not a solid body, so it can sit right after the
  // updraft zone without needing any clearance. Spends most of its cycle
  // swirling marbles inward, then bursts them back outward.
  const vortexY = 1690 * S;
  windVortices.push({ x: centerX(vortexY), y: vortexY });

  // 6. Zigzag slalom
  slalomPlank(1730 * S, 0.1, 1, bodies);
  slalomPlank(1840 * S, 0.1, -1, bodies);
  slalomPlank(1950 * S, 0.1, 1, bodies);
  slalomPlank(2060 * S, 0.1, -1, bodies);

  // 7. Peg field 2 (extra row so there's more time — and more chances to
  // get knocked around — before the next chokepoint)
  pegField(2120 * S, 45 * S, 8, 5, bodies);

  // 7b. Bounce pad — sits in the gap right after peg field 2, pushed as
  // close to it as the gate row below allows so there's genuinely open
  // space above it (a few hundred px) — room for the launch to actually
  // read as a launch before a marble runs into the next thing, rather than
  // popping up and immediately smacking back into whatever's right
  // overhead. Every marble that lands here gets an immediate, dramatic
  // bounce back upward, unlike the calmer group-gathering trampoline later
  // in section 9b.
  bouncePad(2650 * S, bodies);

  // 8. Gate row (lane choice) — a third, center post narrows every lane
  // enough that picking one actually matters instead of all three being
  // wide-open.
  const gateY = 2700 * S;
  [-0.4, 0, 0.4].forEach((offsetRatio) => {
    bodies.push(
      physics.createRectBody(centerX(gateY) + offsetRatio * tubeHalfWidthAt(gateY), gateY, 14, 80, {
        isStatic: true,
        label: 'wall',
      })
    );
  });

  // 8b. Magnet — pulls marbles in toward its center for most of its cycle,
  // then shoves them back out in a short burst, scattering whoever's nearby
  // when the burst lands.
  const magnetY = 2864 * S;
  magnets.push({ x: centerX(magnetY), y: magnetY });

  // 9. Windmill
  const windmillY = 3050 * S;
  spinners.push(
    new Spinner(
      centerX(windmillY),
      windmillY,
      fittedSpinnerLength(windmillY, WINDMILL_LENGTH, 0),
      16,
      WINDMILL_SPEED,
      COLORS.windmill
    )
  );

  // 9b. Trampoline — a flat landing spot right after the windmill where
  // marbles gather until enough have arrived, then all launch together.
  trampoline(3164 * S, 0, 0, bodies);

  // 10. Power bumper arena 2 (late-race chaos)
  bumper(3300 * S, -0.52, bodies);
  bumper(3300 * S, 0.52, bodies);
  bumper(3430 * S, 0, bodies);

  // 11. Peg field 3
  pegField(3550 * S, 55 * S, 6, 5, bodies);

  // 11b. Power bumper arena 3 (extra late-race chaos, extends the course)
  bumper(3950 * S, -0.52, bodies);
  bumper(3950 * S, 0.52, bodies);
  bumper(4080 * S, 0, bodies);

  // 11c. Peg field 4 (one last deflection field before the run-in)
  pegField(4180 * S, 45 * S, 3, 5, bodies);

  // 12. Final funnel into the goal corridor — 4350 must stay in sync with
  // config.js's COURSE_HEIGHT/GOAL_Y (see the comment there).
  funnelPair(4350 * S, 0.18, 20, bodies);

  // Floor — thick enough that a marble carrying a lot of speed after the
  // full drop (or a late bumper fling) can't tunnel straight through a
  // single physics step and fall forever past the bottom of the course.
  const floorY = COURSE_HEIGHT - 60;
  bodies.push(
    physics.createRectBody(centerX(floorY), floorY, tubeHalfWidthAt(floorY) * 2 + 40, 150, {
      isStatic: true,
      label: 'wall',
    })
  );

  bodies.push(...spinners.map((s) => s.body));

  return { bodies, spinners, windZones, magnets, windVortices };
}
