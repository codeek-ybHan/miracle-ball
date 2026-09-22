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
  WINDMILL_LENGTH,
  WINDMILL_GATE_DENSITY,
  WINDMILL_GATE_FRICTION_AIR,
  WINDMILL_GATE_RESTITUTION,
  BUMPER_RADIUS,
  BUMPER_RESTITUTION,
  BOUNCE_PAD_THICKNESS,
  BOUNCE_PAD_MARGIN,
  BOUNCE_PAD_RESTITUTION,
  BOUNCE_PAD_FRICTION,
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
  // Each segment is a separate straight rotated rectangle, and consecutive
  // segments turn by a few degrees at every joint to follow the curve — a
  // +2px pad only extends each one a hair past its own endpoint along its
  // OWN angle, which isn't enough to cover the little wedge-shaped blind
  // spot left on the outside of every bend, where neither rectangle's solid
  // body actually reaches (their edges nearly meet at one point, but the
  // area just beyond that shared corner is uncovered by either one). A
  // marble pressed hard into the wall exactly there can slip past that
  // corner and get pinned in the notch formed by the two segments' end
  // faces — genuinely stuck regardless of friction, the same failure mode
  // as the funnel wedge trap above. A generous overlap (most of a full
  // sample step, not a token 2px) makes every segment reach well past its
  // neighbor's midpoint, so the whole curve is double-covered everywhere
  // and no joint ever exposes a corner a marble could find.
  const overlap = sampleStep * 0.6;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) + overlap;
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

// Bounce pad: fires on every single touch, no gathering required. The body
// itself only needs a modest restitution — the actual launch is a direct
// velocity kick applied in race.js's collision handler (see
// BOUNCE_PAD_LAUNCH_SPEED in config.js for why). Width is sized off the
// local tube half-width so it spans nearly the full passage and catches
// essentially everyone who comes through here, rather than being a narrow
// island some marbles just fall past.
//
// x defaults to the tube's own centerline at y, but callers that need the
// pad centered on some OTHER x (e.g. wherever the wind vortex just forced
// every marble to) must pass it explicitly — the tube's centerline itself
// drifts with the left/right wave, so a pad placed even 60px below the
// vortex can already sit tens of px off from where marbles actually are,
// which is exactly the kind of small-looking mismatch that, against a pad
// only slightly wider than a marble, turns into most marbles missing it.
function bouncePad(y, bodies, x = centerX(y)) {
  const width = 2 * (tubeHalfWidthAt(y) - BOUNCE_PAD_MARGIN);
  const body = physics.createRectBody(x, y, width, BOUNCE_PAD_THICKNESS, {
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

export function createCourse(themeId = 'dark') {
  if (themeId === 'neon') return createNeonCourse();
  if (themeId === 'pastel') return createPastelCourse();
  return createDarkCourse();
}

// 다크 스페이스's course — the original, unchanged sequence. Kept as its own
// function (rather than inline in createCourse) so it's the exact same,
// byte-for-byte code path regardless of the dispatcher above, i.e. zero
// regression risk for the default theme.
function createDarkCourse() {
  const bodies = [];
  const spinners = [];
  const slowZones = [];
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

  // 5. Wind vortex — every marble that falls through gets forced to dead
  // center right at the vortex's own y (see race.js's applyWindVortices — a
  // hard position snap, not just a force nudge, so it's an actual guarantee
  // and not just "most of the time") before spending most of the cycle
  // swirling marbles inward and briefly bursting them back outward. Given
  // real breathing room on both sides (~205px clear of the spinner gauntlet
  // above, 500px before the bounce pad below) instead of being crammed
  // right up against its neighbors.
  const vortexY = 1570 * S;
  const vortexX = centerX(vortexY);
  windVortices.push({ x: vortexX, y: vortexY });

  // 5b. Bounce pad — sits well after the vortex (nothing else in that gap),
  // so the guaranteed centering above translates into a guaranteed hit here
  // too: every marble already lines up dead center right where this pad
  // is, instead of needing a wide pad to fish for whoever happens to drift
  // into range. Explicitly centered on vortexX (not this y's own tube
  // centerline — see bouncePad()'s comment for why that distinction
  // actually matters here).
  //
  // The 500px gap itself isn't arbitrary: BOUNCE_PAD_LAUNCH_SPEED is a full
  // MARBLE_MAX_SPEED kick, and measuring the actual launch (not just
  // estimating from v²/2g, which undershoots badly once Matter's real
  // integration and repeated re-launches are in the picture) showed a
  // marble rockets ~349px straight back up off the pad. With only ~200px of
  // clearance that overshoot punched back through the vortex and into the
  // spinner gauntlet above it, and a marble that keeps re-crossing the
  // vortex on the way up and back down every bounce can end up stuck
  // oscillating there indefinitely instead of ever continuing down the
  // course. 500px keeps the entire bounce arc well clear of both.
  const bouncePadY = vortexY + 500;
  bouncePad(bouncePadY, bodies, vortexX);

  // 5c. Slow zone: caps the fall speed of whoever is CURRENTLY in 1st or
  // 2nd place while they're inside it (checked live, not a blanket effect
  // on anyone passing through — see race.js's applySlowZones), so it's a
  // real rubber-band rather than something the whole field feels equally.
  // Starts a generous 220px after the bounce pad (not overlapping it).
  const slowZoneStart = bouncePadY + 220;
  slowZones.push({ yStart: slowZoneStart, yEnd: slowZoneStart + (1650 * S - 1440 * S) });

  // 6. Zigzag slalom — 6 planks now (up from 4), with a wide 160px gap above
  // the first one so it reads as clearly separate from the slow zone rather
  // than crowding right up against it. Everything through bumper arena 3
  // below shifts later with it by the same amount the slalom grew, keeping
  // all the tested gaps between sections unchanged.
  //
  // Angle bumped up from 0.1 to 0.22 (~5.7deg to ~12.6deg) — but the angle
  // alone was never the reason marbles used to sit dead-still on a plank
  // for tens of seconds at a time (0.28 alone didn't fix it either; see
  // entities/marble.js's frictionStatic comment for the real cause). This
  // steeper tilt is just a smaller, secondary help on top of that fix.
  slalomPlank(2409 * S, 0.22, 1, bodies);
  slalomPlank(2519 * S, 0.22, -1, bodies);
  slalomPlank(2629 * S, 0.22, 1, bodies);
  slalomPlank(2739 * S, 0.22, -1, bodies);
  slalomPlank(2849 * S, 0.22, 1, bodies);
  slalomPlank(2959 * S, 0.22, -1, bodies);

  // 7. Peg field 2 (extra row so there's more time — and more chances to
  // get knocked around — before the next chokepoint)
  pegField(3019 * S, 45 * S, 8, 5, bodies);

  // 8. Gate row (lane choice) — a third, center post narrows every lane
  // enough that picking one actually matters instead of all three being
  // wide-open. Kept well clear of peg field 2 above it (224px of open
  // space) so marbles have real room to settle before having to pick a lane.
  const gateY = 3709 * S;
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
  const magnetY = 3873 * S;
  magnets.push({ x: centerX(magnetY), y: magnetY });

  // 9. Windmill — a weighted trapdoor instead of a constantly-spinning
  // blade. Starts perfectly horizontal and rigid (isStatic), fully blocking
  // the passage like a solid beam, and stays that way until the very first
  // marble actually touches it (see race.js's collision handler for the
  // 'windmillGate' branch) — at that instant it's switched to a real
  // dynamic body, so gravity and that marble's weight immediately start
  // tipping it open, same as a real seesaw trapdoor reacting to a foot
  // landing on one end. Nothing re-locks it afterward, so it's a live
  // physics object other marbles can keep nudging for the rest of the race.
  //
  // Pinning its center was tried first with a Matter.Constraint, but a
  // stiffness-1 point constraint on a continuously-rotating body turned out
  // to be genuinely unstable in Matter's solver: body.position stayed
  // exactly at the anchor while the body's actual vertices (its real
  // collision geometry) quietly drifted tens of px away from it over a few
  // seconds, since the constraint's positional correction doesn't keep the
  // two in sync under rotation. That let the beam's real solid shape drift
  // into places it was never meant to reach, wedging marbles against walls
  // it had no business touching. race.js re-pins the center directly every
  // physics step instead (zeroing linear velocity only, angular velocity
  // untouched) — the same "don't trust passive physics for a guarantee,
  // state it directly" approach as the bounce pad and wind vortex above.
  const windmillY = 4059 * S;
  const windmillPivot = { x: centerX(windmillY), y: windmillY };
  const windmillBody = physics.createRectBody(
    windmillPivot.x,
    windmillPivot.y,
    fittedSpinnerLength(windmillY, WINDMILL_LENGTH, 0),
    16,
    {
      isStatic: true,
      label: 'windmillGate',
      density: WINDMILL_GATE_DENSITY,
      frictionAir: WINDMILL_GATE_FRICTION_AIR,
      restitution: WINDMILL_GATE_RESTITUTION,
    }
  );
  windmillBody.plugin = { activated: false, pivot: windmillPivot };
  bodies.push(windmillBody);
  spinners.push({ body: windmillBody, color: COLORS.windmill, update() {} });

  // 10. Power bumper arena 2 (late-race chaos)
  bumper(4309 * S, -0.52, bodies);
  bumper(4309 * S, 0.52, bodies);
  bumper(4439 * S, 0, bodies);

  // 11. Peg field 3
  pegField(4559 * S, 55 * S, 6, 5, bodies);

  // 11b. Power bumper arena 3 (extra late-race chaos, extends the course)
  const bumperArena3Y = 4959 * S;
  const bumperArena3LastY = 5089 * S;
  bumper(bumperArena3Y, -0.52, bodies);
  bumper(bumperArena3Y, 0.52, bodies);
  bumper(bumperArena3LastY, 0, bodies);

  // 11c'. Second slow zone — the same rank-targeted rubber-band as section
  // 5c, but late in the course instead of mid-course, so whoever's leading
  // this late isn't safe until they're actually across the line. Given the
  // same generous margin above (100px clear of bumper arena 3, up from the
  // old 15px) as the first slow zone, and peg field 4 below shifts later to
  // match so the zone's own span and the gap after it stay unchanged.
  const finalSlowZoneStart = bumperArena3LastY + BUMPER_RADIUS + 100;
  const finalSlowZoneEnd = finalSlowZoneStart + 100;
  slowZones.push({ yStart: finalSlowZoneStart, yEnd: finalSlowZoneEnd });

  // 11c. Peg field 4 (one last deflection field before the run-in)
  const pegField4Y = 5258 * S;
  pegField(pegField4Y, 45 * S, 3, 5, bodies);

  // 12. Final funnel into the goal corridor — 5428 must stay in sync with
  // config.js's COURSE_HEIGHT/GOAL_Y (see the comment there).
  const finalFunnelY = 5428 * S;
  funnelPair(finalFunnelY, 0.18, 20, bodies);

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

  return { bodies, spinners, slowZones, magnets, windVortices };
}

// 네온 사이버's course — a faster, more mechanical/chaotic gauntlet: short
// intro peg field, wind-vortex+bounce-pad combo front-loaded right after
// the funnel, two doubled bumper arenas each followed by a full spinner
// gauntlet, a deliberate open breather stretch, then the late-race hazard
// cluster (gate/magnet/windmill) and a short outro peg field. Every
// obstacle-to-obstacle gap below reuses a value already proven safe
// between those same two obstacle types somewhere in createDarkCourse()
// (only the SEQUENCE differs, not the transition geometry) — see map.js's
// git history / the session that added this for the full gap catalog this
// was derived from. The final funnel must land at exactly 5428*S (same as
// dark), since COURSE_HEIGHT/GOAL_Y in config.js are shared across all
// three themes on purpose (see that file's comment) — every intermediate Y
// below is annotated with its derived value so the arithmetic chain to
// that target is easy to re-verify.
function createNeonCourse() {
  const bodies = [];
  const spinners = [];
  const slowZones = [];
  const magnets = [];
  const windVortices = [];

  tubeChain(-1, bodies);
  tubeChain(1, bodies);

  // 1. Short intro peg field (4 rows vs dark's 7)
  pegField(150 * S, 55 * S, 4, 5, bodies); // last row unscaled = 150+3*55=315

  // 2. Funnel — reuses tested pegField->funnel gap (120)
  const funnelY = 315 + 120; // 435
  funnelPair(funnelY * S, 0.15, 20, bodies);

  // 3. Wind vortex + bounce pad, front-loaded. No exact dark pairing for
  // "funnel->vortex" exists, so this uses the funnel->bumperArena gap (200)
  // as a generous conservative stand-in — no solid geometry near the
  // vortex/pad besides the pad's own rectangle, so this is low-risk
  // regardless.
  const vortexY = (funnelY + 200) * S; // 889
  const vortexX = centerX(vortexY);
  windVortices.push({ x: vortexX, y: vortexY });
  const bouncePadY = vortexY + 500; // 1389 (raw, matches dark's convention)
  bouncePad(bouncePadY, bodies, vortexX);
  const slowZoneStart = bouncePadY + 220; // 1609 (raw)
  const slowZoneEnd = slowZoneStart + 210 * S; // 1903
  slowZones.push({ yStart: slowZoneStart, yEnd: slowZoneEnd });

  // 4. Doubled bumper arena #1 (two arena-1-style triples back to back)
  const bumperA1 = slowZoneEnd + 200 * S; // 2183
  const bumperA2 = bumperA1 + 120 * S; // 2351
  const bumperA3 = bumperA2 + 120 * S; // 2519
  const bumperA4 = bumperA3 + 120 * S; // 2687
  bumper(bumperA1, -0.52, bodies);
  bumper(bumperA1, 0.52, bodies);
  bumper(bumperA2, 0, bodies);
  bumper(bumperA3, -0.52, bodies);
  bumper(bumperA3, 0.52, bodies);
  bumper(bumperA4, 0, bodies);

  // 5. Spinner gauntlet #1
  const spinner1Y = bumperA4 + 160 * S; // 2911
  [
    { y: spinner1Y, offsetRatio: -0.22, speed: SPINNER_SPEED },
    { y: spinner1Y + 140 * S, offsetRatio: 0.22, speed: -SPINNER_SPEED },
    { y: spinner1Y + 280 * S, offsetRatio: -0.22, speed: SPINNER_SPEED },
  ].forEach(({ y, offsetRatio, speed }) => {
    const length = fittedSpinnerLength(y, SPINNER_LENGTH, offsetRatio);
    spinners.push(new Spinner(centerX(y) + offsetRatio * tubeHalfWidthAt(y), y, length, 14, speed, COLORS.spinner));
  });
  const gauntlet1LastY = spinner1Y + 280 * S; // 3303

  // 6. Doubled bumper arena #2
  const bumperC1 = gauntlet1LastY + 200 * S; // 3583
  const bumperC2 = bumperC1 + 120 * S; // 3751
  const bumperC3 = bumperC2 + 120 * S; // 3919
  const bumperC4 = bumperC3 + 120 * S; // 4087
  bumper(bumperC1, -0.52, bodies);
  bumper(bumperC1, 0.52, bodies);
  bumper(bumperC2, 0, bodies);
  bumper(bumperC3, -0.52, bodies);
  bumper(bumperC3, 0.52, bodies);
  bumper(bumperC4, 0, bodies);

  // 7. Spinner gauntlet #2
  const spinner2Y = bumperC4 + 160 * S; // 4311
  [
    { y: spinner2Y, offsetRatio: -0.22, speed: SPINNER_SPEED },
    { y: spinner2Y + 140 * S, offsetRatio: 0.22, speed: -SPINNER_SPEED },
    { y: spinner2Y + 280 * S, offsetRatio: -0.22, speed: SPINNER_SPEED },
  ].forEach(({ y, offsetRatio, speed }) => {
    const length = fittedSpinnerLength(y, SPINNER_LENGTH, offsetRatio);
    spinners.push(new Spinner(centerX(y) + offsetRatio * tubeHalfWidthAt(y), y, length, 14, speed, COLORS.spinner));
  });
  const gauntlet2LastY = spinner2Y + 280 * S; // 4703

  // 8. Open breather stretch — no obstacles, just the existing tubeChain
  // walls (already proven safe across the whole COURSE_HEIGHT range
  // regardless of what's inside it), so zero wall-trap risk. Deliberate
  // pacing beat after two dense bumper+spinner blocks; length is exactly
  // whatever's needed so the hazard cluster + outro land the final funnel
  // on the required 5428*S.
  const gateY = gauntlet2LastY + 2000.2; // 6703.2

  // 9. Gate row
  [-0.4, 0, 0.4].forEach((offsetRatio) => {
    bodies.push(
      physics.createRectBody(centerX(gateY) + offsetRatio * tubeHalfWidthAt(gateY), gateY, 14, 80, {
        isStatic: true,
        label: 'wall',
      })
    );
  });

  // 10. Magnet — reuses gate->magnet gap (164)
  const magnetY = gateY + 164 * S; // 6932.8
  magnets.push({ x: centerX(magnetY), y: magnetY });

  // 11. Windmill trapdoor — reuses magnet->windmill gap (186). Identical
  // construction/behavior to dark — nothing about the windmill itself
  // changes per theme.
  const windmillY = magnetY + 186 * S; // 7193.2
  const windmillPivot = { x: centerX(windmillY), y: windmillY };
  const windmillBody = physics.createRectBody(
    windmillPivot.x,
    windmillPivot.y,
    fittedSpinnerLength(windmillY, WINDMILL_LENGTH, 0),
    16,
    {
      isStatic: true,
      label: 'windmillGate',
      density: WINDMILL_GATE_DENSITY,
      frictionAir: WINDMILL_GATE_FRICTION_AIR,
      restitution: WINDMILL_GATE_RESTITUTION,
    }
  );
  windmillBody.plugin = { activated: false, pivot: windmillPivot };
  bodies.push(windmillBody);
  spinners.push({ body: windmillBody, color: COLORS.windmill, update() {} });

  // 12. Short outro peg field — reuses bumperArena->pegField gap (120)
  const pegOutroY = windmillY + 120 * S; // 7361.2
  pegField(pegOutroY, 45 * S, 3, 5, bodies);
  const pegOutroLastY = pegOutroY + 2 * 45 * S; // 7487.2

  // 13. Final funnel — MUST land at exactly 5428*S = 7599.2. Reuses tested
  // pegField->finalFunnel gap (80).
  const finalFunnelY = pegOutroLastY + 80 * S; // 7599.2 === 5428 * S
  funnelPair(finalFunnelY, 0.18, 20, bodies);

  const floorY = COURSE_HEIGHT - 60;
  bodies.push(
    physics.createRectBody(centerX(floorY), floorY, tubeHalfWidthAt(floorY) * 2 + 40, 150, {
      isStatic: true,
      label: 'wall',
    })
  );

  bodies.push(...spinners.map((s) => s.body));

  return { bodies, spinners, slowZones, magnets, windVortices };
}

// 파스텔 캔디's course — a softer, bouncier candy course: long peg fields (6
// fields total, up to 8 rows each), more bumper arenas (4 vs dark's 3), a
// shorter/gentler slalom (4 planks at 0.18 rad vs dark's 6 at 0.22), gate +
// magnet for variety, but no wind-vortex/bounce-pad combo, no windmill
// trapdoor, and no spinner gauntlet — the mechanical/fast obstacles all
// live in the neon course instead, keeping this one's identity as "many
// gentle bounces, nothing sharp or narrow". Same gap-reuse discipline as
// createNeonCourse(); see that function's comment for the rationale.
function createPastelCourse() {
  const bodies = [];
  const spinners = [];
  const slowZones = [];
  const magnets = [];
  const windVortices = [];

  tubeChain(-1, bodies);
  tubeChain(1, bodies);

  // 1. Peg field 1 — 8 rows (vs dark's 7)
  pegField(150 * S, 55 * S, 8, 5, bodies); // last unscaled = 150+7*55=535

  // 2. Funnel — slightly gentler innerGap (24 vs dark's 20, MORE generous).
  // Reuses pegField->funnel gap (120).
  const funnelYUnscaled = 535 + 120; // 655
  funnelPair(funnelYUnscaled * S, 0.15, 24, bodies);

  // 3. Bumper arena 1 — reuses funnel->bumperArena(200), internal(120)
  const bumperA1 = (funnelYUnscaled + 200) * S; // 1197
  const bumperA2 = bumperA1 + 120 * S; // 1365
  bumper(bumperA1, -0.52, bodies);
  bumper(bumperA1, 0.52, bodies);
  bumper(bumperA2, 0, bodies);

  // 4. Peg field 2 — 8 rows, reuses bumperArena->pegField(120)
  const pegField2Y = bumperA2 + 120 * S; // 1533
  pegField(pegField2Y, 45 * S, 8, 5, bodies);
  const pegField2LastY = pegField2Y + 7 * 45 * S; // 1974

  // 5. Bumper arena 2 — reuses pegField->bumperArena(125), internal(130)
  const bumperB1 = pegField2LastY + 125 * S; // 2149
  const bumperB2 = bumperB1 + 130 * S; // 2331
  bumper(bumperB1, -0.52, bodies);
  bumper(bumperB1, 0.52, bodies);
  bumper(bumperB2, 0, bodies);

  // 6. Peg field 3 — 6 rows, reuses bumperArena->pegField(120)
  const pegField3Y = bumperB2 + 120 * S; // 2499
  pegField(pegField3Y, 55 * S, 6, 5, bodies);
  const pegField3LastY = pegField3Y + 5 * 55 * S; // 2884

  // 7. Gate row — reuses pegField->gate(375)
  const gateY = pegField3LastY + 375 * S; // 3409
  [-0.4, 0, 0.4].forEach((offsetRatio) => {
    bodies.push(
      physics.createRectBody(centerX(gateY) + offsetRatio * tubeHalfWidthAt(gateY), gateY, 14, 80, {
        isStatic: true,
        label: 'wall',
      })
    );
  });

  // 7b. Magnet — non-solid, safe anywhere; reuses gate->magnet(164) for
  // pacing consistency only.
  const magnetY = gateY + 164 * S; // 3638.6
  magnets.push({ x: centerX(magnetY), y: magnetY });

  // 7c. Slow zone — also non-solid (pure Y-range velocity clamp, no body),
  // placed in the open stretch after peg field 3.
  slowZones.push({ yStart: pegField3LastY + 100 * S, yEnd: pegField3LastY + 200 * S });

  // 8. Slalom — SHORTER (4 planks vs dark's 6) and GENTLER (0.18 vs 0.22
  // angle), same 110*S internal spacing as dark. No tested "gate->slalom"
  // pairing exists in dark, so this uses a raw +300px gap (NOT ×S — larger
  // than any tested "into a new solid obstacle" gap except pegField->gate
  // itself, so it errs safe). This raw (non-×S) addition is required for
  // the final-funnel arithmetic below to land correctly.
  const slalomStart = gateY + 300; // 3709
  slalomPlank(slalomStart, 0.18, 1, bodies);
  slalomPlank(slalomStart + 110 * S, 0.18, -1, bodies);
  slalomPlank(slalomStart + 220 * S, 0.18, 1, bodies);
  slalomPlank(slalomStart + 330 * S, 0.18, -1, bodies);
  const slalomLastY = slalomStart + 330 * S; // 4171

  // 9. Peg field 4 — reuses slalom->pegField(60)
  const pegField4Y = slalomLastY + 60 * S; // 4255
  pegField(pegField4Y, 55 * S, 5, 5, bodies);
  const pegField4LastY = pegField4Y + 4 * 55 * S; // 4563

  // 10. Bumper arena 3 — reuses pegField->bumperArena(125), internal(130)
  const bumperC1 = pegField4LastY + 125 * S; // 4738
  const bumperC2 = bumperC1 + 130 * S; // 4920
  bumper(bumperC1, -0.52, bodies);
  bumper(bumperC1, 0.52, bodies);
  bumper(bumperC2, 0, bodies);

  // 11. Peg field 5 — 8 rows, reuses bumperArena->pegField(120)
  const pegField5Y = bumperC2 + 120 * S; // 5088
  pegField(pegField5Y, 55 * S, 8, 5, bodies);
  const pegField5LastY = pegField5Y + 7 * 55 * S; // 5627

  // 12. Bumper arena 4 (4 total vs dark's 3) — reuses
  // pegField->bumperArena(125), internal(120)
  const bumperD1 = pegField5LastY + 125 * S; // 5802
  const bumperD2 = bumperD1 + 120 * S; // 5970
  bumper(bumperD1, -0.52, bodies);
  bumper(bumperD1, 0.52, bodies);
  bumper(bumperD2, 0, bodies);

  // 13. Peg field 6 — short outro, reuses bumperArena->pegField(120)
  const pegField6Y = bumperD2 + 120 * S; // 6138
  pegField(pegField6Y, 45 * S, 3, 5, bodies);
  const pegField6LastY = pegField6Y + 2 * 45 * S; // 6264

  // 14. Final funnel — MUST land at exactly 5428*S = 7599.2. The 1335.2px
  // gap here is well above the tested minimum (80*S=112), so it's a
  // generous "gentle final glide" fitting pastel's softer pacing.
  const finalFunnelY = pegField6LastY + 1335.2; // 7599.2 === 5428 * S
  funnelPair(finalFunnelY, 0.18, 20, bodies);

  const floorY = COURSE_HEIGHT - 60;
  bodies.push(
    physics.createRectBody(centerX(floorY), floorY, tubeHalfWidthAt(floorY) * 2 + 40, 150, {
      isStatic: true,
      label: 'wall',
    })
  );

  bodies.push(...spinners.map((s) => s.body)); // stays empty — fine, race.js handles an empty spinners array / missing windmillGate safely

  return { bodies, spinners, slowZones, magnets, windVortices };
}
