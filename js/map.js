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
//
// `half` used to be the IDEAL tubeHalfWidthAt(y) curve directly, with
// `margin` (42) meant to leave real clearance between the edge peg
// (PEG_RADIUS=15) and the wall. That held up while the wall was thin (12),
// but after thickening it to 24 (see WALL_THICKNESS's comment) the wall's
// real inner face moved 6px further in without this margin accounting for
// it — measured out to an actual 15px gap between the edge peg and the real
// wall, LESS than a marble's 16px diameter, wedging marbles right there.
// Same fix as fittedSpinnerLength: measure from the real wall face, not the
// ideal curve.
function pegSpacingAt(y, count) {
  const margin = 42;
  const half = tubeHalfWidthAt(y) - WALL_THICKNESS / 2;
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

// A converging pair of angled walls. Their outer ends reach PAST the tube
// wall (`WALL_OVERLAP` below) instead of stopping short of it, and the inner
// tips leave a fixed `innerGap` regardless of the local tube width, so the
// passage never becomes too tight for a marble even where the tube is
// narrowed.
//
// This went through two earlier designs, both wrong in opposite directions:
// (1) aim the outer ends exactly AT the tube wall (reach =
// tubeHalfWidthAt(funnelY), no margin) — safe while the funnel angle was
// shallow (the plank's tilt keeps its tip close to y=funnelY, so "reach the
// ideal curve at funnelY" was a good enough stand-in for "reach the real
// wall at the TIP's own y", which drifts away from funnelY along a tilted
// plank). Once the angle was steepened for flow (see the bottleneck
// funnel's own comment), that drift stopped being negligible and opened a
// real gap beside the funnel that marbles fell through.
// (2) pull the reach IN by a WALL_CLEARANCE margin instead, on the theory
// that a wide, deliberate gap is safer than a knife's-edge near-miss.
// Confirmed by direct simulation this DID stop marbles from getting wedged
// at the tip, but it also gave fast-moving marbles a clean run of open space
// right beside the tube wall, which turned out to matter: enough speed
// carried through it that some tunneled straight through the (thin, at the
// time) tube wall itself and left the course entirely.
// Pushing the tip PAST the wall instead removes the open lane altogether —
// there's no gap left for anything to slip through, fast or slow. The
// wedge-pocket risk design (1) was worried about (a straight plank crossing
// the curved wall at a bad angle) mostly doesn't apply here: two overlapping
// STATIC bodies just merge into one continuous blocked region from the
// marble's side, with no re-entrant notch. The same trap simulation that
// verified design (2) still occasionally finds one marble resting motionless
// partway along the now-longer plank itself in an adversarial worst case
// (dropped from a near-standstill right beside it) — that's a marble resting
// on an ordinary flat surface, not wedged in a notch, and isn't reproducible
// in real play (a marble reaches any funnel with real fall speed, and
// applyWallPush/jitter still act on it) — full-race simulation across all
// three themes confirms no marble ever actually stalls there.
// `funnels`, when passed, collects { y } for every funnel this creates —
// race.js uses it to know exactly where to suppress bounce (see
// applyFunnelDamping / FUNNEL_RESTITUTION in config.js for why that can't
// just be a restitution on these wall bodies themselves).
function funnelPair(y, angle, innerGap, bodies, overlap = 0, funnels) {
  // Needs to clear not just the ideal curve but the real wall's solid inner
  // face (WALL_THICKNESS/2 further out) AND the worst-case curve drift over
  // the plank's own vertical footprint at steep angles (~50-60px observed
  // for the current angles) — 60 clears all of that with room to spare.
  // Confirmed by direct simulation (many full-race trials, all three
  // themes): 0 marbles ever escape the course through a funnel gap.
  const WALL_OVERLAP = 60;
  const cos = Math.cos(angle);
  const outerReach = tubeHalfWidthAt(y) + WALL_OVERLAP + overlap;
  const innerGapHalf = innerGap / 2;
  const halfLength = (outerReach - innerGapHalf) / (2 * cos);
  const offset = innerGapHalf + halfLength * cos;
  const cx = centerX(y);
  bodies.push(
    physics.createRectBody(cx - offset, y, halfLength * 2, 14, { isStatic: true, label: 'funnelWall', angle })
  );
  bodies.push(
    physics.createRectBody(cx + offset, y, halfLength * 2, 14, {
      isStatic: true,
      label: 'funnelWall',
      angle: -angle,
    })
  );
  if (funnels) funnels.push({ y });
}

// A single tilted plank that stops well short of the tube wall (a real open
// gap, not just a narrow one — an angled plank meeting a wall almost head-on
// forms a sealed wedge there, which is a trap regardless of how much it
// "overlaps") and crosses past the centerline on the inner end, so
// consecutive alternating planks always overlap in the middle and no marble
// can fall straight through untouched.
//
// `tiltOutward` controls which end is the HIGH end. Default (false) tilts
// the plank with its OUTER end (toward the tube wall) higher than its inner
// end, so a marble sliding down it rolls toward the CENTER — where the next
// alternating plank is waiting, the actual "zigzag" weave. The old default
// was the reverse (outer end low), which sent marbles sliding straight into
// the corner pocket between the plank's outer tip and the curved tube
// wall — the same wedge-trap shape as funnelPair's overlap=0 comment above
// — where they could sit nearly motionless instead of continuing down.
// `tiltOutward: true` keeps that old direction for the rare deliberate
// exception.
function slalomPlank(y, angle, side, bodies, tiltOutward = false) {
  const outerReach = tubeHalfWidthAt(y) - 60;
  const innerCross = 20;
  const cos = Math.cos(angle);
  const length = (outerReach + innerCross) / cos;
  const offset = (side * (outerReach - innerCross)) / 2;
  const rotation = tiltOutward ? side * angle : -side * angle;
  bodies.push(
    physics.createRectBody(centerX(y) + offset, y, length, 14, {
      isStatic: true,
      label: 'slalomPlank',
      angle: rotation,
    })
  );
}

// Gate row (lane choice): a short line of evenly spaced posts across the
// tube. Four posts (up from the old three) leaves five narrower lanes
// instead of four wider ones, so picking a lane actually matters more.
function gateRow(y, bodies) {
  [-0.5, -0.17, 0.17, 0.5].forEach((offsetRatio) => {
    bodies.push(
      physics.createRectBody(centerX(y) + offsetRatio * tubeHalfWidthAt(y), y, 14, 80, {
        isStatic: true,
        label: 'wall',
      })
    );
  });
}

// A rotating spinner/windmill sweeps a full circle of radius = half its
// length around its own center as it turns, so however long we'd LIKE it to
// be, it must never be long enough (combined with how far off-center it
// sits) to sweep into the tube wall at its particular y — otherwise it would
// clip into a static wall on every rotation. This clamps the desired length
// down to whatever actually fits the local tube width, so obstacles can be
// made longer without needing to hand-place each one at a "wide" point.
//
// `half` used to be the IDEAL tubeHalfWidthAt(y) curve directly, but the
// real tubeChain wall's solid inner face sits WALL_THICKNESS/2 inside that
// curve — fine while the wall was thin (12), but after thickening it to 24
// (see that constant's comment) the windmill/spinners were still being
// fitted against the OLD, now-too-generous boundary and could physically
// clip the real (now-closer) wall on every rotation, jamming the windmill
// solid instead of ever tipping open. Subtracting the real inset here fixes
// that regardless of what WALL_THICKNESS is tuned to later.
function fittedSpinnerLength(y, desiredLength, offsetRatio) {
  const half = tubeHalfWidthAt(y) - WALL_THICKNESS / 2;
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
  const funnels = [];

  // Winding tube boundary (replaces straight side walls); its width itself
  // also varies along the way, not just its left-right curve.
  tubeChain(-1, bodies);
  tubeChain(1, bodies);

  // 1. Peg field
  pegField(150 * S, 55 * S, 7, 5, bodies);

  // 2. Narrowing bottleneck funnel — tight enough that marbles have to
  // queue single-file, jostling for who gets through first. Angle steepened
  // from 0.15 to 0.30 — the gravity component that actually pulls a marble
  // IN toward the gap is g*sin(angle), so the old shallow angle barely
  // pulled at all and a marble landing off-center could take well over a
  // second just crawling sideways (confirmed by direct simulation). A
  // steeper wall gets it there in a fraction of that.
  funnelPair(600 * S, 0.3, 20, bodies, 0, funnels);

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
  // Length shortened from 210*S to 120*S — at SLOW_ZONE_MAX_SPEED (3px/f)
  // the old length stalled a leader for nearly 100 frames (~1.6s), longer
  // than felt good.
  const slowZoneStart = bouncePadY + 220;
  slowZones.push({ yStart: slowZoneStart, yEnd: slowZoneStart + 120 * S });

  // 6. Zigzag slalom — 4 planks, with a wide 160px gap above the first one
  // so it reads as clearly separate from the slow zone rather than crowding
  // right up against it.
  //
  // Angle bumped up from 0.1 to 0.22 (~5.7deg to ~12.6deg) — but the angle
  // alone was never the reason marbles used to sit dead-still on a plank
  // for tens of seconds at a time (0.28 alone didn't fix it either; see
  // entities/marble.js's frictionStatic comment for the real cause). This
  // steeper tilt is just a smaller, secondary help on top of that fix.
  //
  // Only the first plank keeps the old outward tilt (see slalomPlank's
  // comment) — the rest tilt inward so marbles weave toward the center
  // instead of sliding into the corner pocket by the tube wall.
  slalomPlank(2409 * S, 0.22, 1, bodies, true);
  slalomPlank(2519 * S, 0.22, -1, bodies);
  slalomPlank(2629 * S, 0.22, 1, bodies);
  slalomPlank(2739 * S, 0.22, -1, bodies);

  // 7. (Peg field 2 removed — only one peg field left in this course now,
  // see item 1. Plain open stretch here instead.)

  // 8. Gate row (lane choice)
  const gateY = 3709 * S;
  gateRow(gateY, bodies);

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

  // 10. (Power bumper arena 2 removed — arena 1 and arena 3 stay, plain open
  // stretch here instead.)

  // 11. (Peg field 3 removed — only one peg field left in this course now,
  // see item 1. Plain open stretch here instead.)

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
  // old 15px) as the first slow zone.
  const finalSlowZoneStart = bumperArena3LastY + BUMPER_RADIUS + 100;
  const finalSlowZoneEnd = finalSlowZoneStart + 100;
  slowZones.push({ yStart: finalSlowZoneStart, yEnd: finalSlowZoneEnd });

  // (Peg field 4, the last deflection field before the run-in, was removed
  // — this is now a plain open stretch straight into the final funnel.)

  // 12. Final funnel into the goal corridor — 5428 must stay in sync with
  // config.js's COURSE_HEIGHT/GOAL_Y (see the comment there). Angle
  // steepened to 0.32 for the same reason as the bottleneck funnel above —
  // a decisive final pull into the goal instead of a slow crawl to center.
  const finalFunnelY = 5428 * S;
  funnelPair(finalFunnelY, 0.32, 20, bodies, 0, funnels);

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

  return { bodies, spinners, slowZones, magnets, windVortices, funnels };
}

// 네온 사이버's course — a faster, more mechanical/chaotic gauntlet: short
// intro peg field, wind-vortex+bounce-pad combo front-loaded right after
// the funnel, a doubled bumper arena followed by a full spinner gauntlet
// (twice — the second gauntlet now follows an open stretch instead of its
// own bumper arena), a 4-plank zigzag slalom, a deliberate open breather
// stretch, then the late-race hazard cluster (gate/magnet/windmill) straight into
// the final funnel. Every obstacle-to-obstacle gap below reuses a value
// already proven safe
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
  const funnels = [];

  tubeChain(-1, bodies);
  tubeChain(1, bodies);

  // 1. Short intro peg field (4 rows vs dark's 7)
  pegField(150 * S, 55 * S, 4, 5, bodies); // last row unscaled = 150+3*55=315

  // 2. Funnel — reuses tested pegField->funnel gap (120). Angle steepened
  // to 0.30 (see dark's bottleneck funnel comment for why the old 0.15 was
  // too shallow to pull a marble to center at any reasonable speed).
  const funnelY = 315 + 120; // 435
  funnelPair(funnelY * S, 0.3, 20, bodies, 0, funnels);

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
  // Length shortened from 210*S to 120*S, matching dark's first slow zone
  // (see that comment for why the old length stalled a leader too long).
  const slowZoneEnd = slowZoneStart + 120 * S; // 1777
  slowZones.push({ yStart: slowZoneStart, yEnd: slowZoneEnd });

  // 4. Doubled bumper arena #1 (two arena-1-style triples back to back)
  const bumperA1 = slowZoneEnd + 200 * S; // 2057
  const bumperA2 = bumperA1 + 120 * S; // 2225
  const bumperA3 = bumperA2 + 120 * S; // 2393
  const bumperA4 = bumperA3 + 120 * S; // 2561
  bumper(bumperA1, -0.52, bodies);
  bumper(bumperA1, 0.52, bodies);
  bumper(bumperA2, 0, bodies);
  bumper(bumperA3, -0.52, bodies);
  bumper(bumperA3, 0.52, bodies);
  bumper(bumperA4, 0, bodies);

  // 5. Spinner gauntlet #1
  const spinner1Y = bumperA4 + 160 * S; // 2785
  [
    { y: spinner1Y, offsetRatio: -0.22, speed: SPINNER_SPEED },
    { y: spinner1Y + 140 * S, offsetRatio: 0.22, speed: -SPINNER_SPEED },
    { y: spinner1Y + 280 * S, offsetRatio: -0.22, speed: SPINNER_SPEED },
  ].forEach(({ y, offsetRatio, speed }) => {
    const length = fittedSpinnerLength(y, SPINNER_LENGTH, offsetRatio);
    spinners.push(new Spinner(centerX(y) + offsetRatio * tubeHalfWidthAt(y), y, length, 14, speed, COLORS.spinner));
  });
  const gauntlet1LastY = spinner1Y + 280 * S; // 3177

  // 6. (Doubled bumper arena #2 removed — arena #1 stays. bumperC1..C4 are
  // kept as pure Y markers so spinner gauntlet #2 below stays at exactly
  // the same position.)
  const bumperC1 = gauntlet1LastY + 200 * S; // 3457
  const bumperC2 = bumperC1 + 120 * S; // 3625
  const bumperC3 = bumperC2 + 120 * S; // 3793
  const bumperC4 = bumperC3 + 120 * S; // 3961

  // 7. Spinner gauntlet #2
  const spinner2Y = bumperC4 + 160 * S; // 4185
  [
    { y: spinner2Y, offsetRatio: -0.22, speed: SPINNER_SPEED },
    { y: spinner2Y + 140 * S, offsetRatio: 0.22, speed: -SPINNER_SPEED },
    { y: spinner2Y + 280 * S, offsetRatio: -0.22, speed: SPINNER_SPEED },
  ].forEach(({ y, offsetRatio, speed }) => {
    const length = fittedSpinnerLength(y, SPINNER_LENGTH, offsetRatio);
    spinners.push(new Spinner(centerX(y) + offsetRatio * tubeHalfWidthAt(y), y, length, 14, speed, COLORS.spinner));
  });
  const gauntlet2LastY = spinner2Y + 280 * S; // 4577

  // 7b. Zigzag slalom — 4 planks, reusing dark's exact angle (0.22) and
  // 110*S internal spacing (both already tested there). Placed right at the
  // front of the open breather stretch below (entry gap reuses the
  // funnel->bumperArena(200) value), which still leaves the gate row over
  // 1300px of genuinely obstacle-free track clear after it. Only the first
  // plank keeps the old outward tilt (see slalomPlank's comment) — the rest
  // tilt inward so marbles weave toward the center.
  const slalomY = gauntlet2LastY + 200 * S; // 4857
  slalomPlank(slalomY, 0.22, 1, bodies, true);
  slalomPlank(slalomY + 110 * S, 0.22, -1, bodies);
  slalomPlank(slalomY + 220 * S, 0.22, 1, bodies);
  slalomPlank(slalomY + 330 * S, 0.22, -1, bodies);

  // 8. Open breather stretch — no obstacles, just the existing tubeChain
  // walls (already proven safe across the whole COURSE_HEIGHT range
  // regardless of what's inside it), so zero wall-trap risk. Deliberate
  // pacing beat after two dense bumper+spinner blocks (and now the slalom
  // above); length (2000.2 + the 126 the shortened slow zone above no
  // longer eats up) is exactly whatever's needed so the hazard cluster
  // lands the final funnel on the required 5428*S.
  const gateY = gauntlet2LastY + 2126.2; // 6703.2

  // 9. Gate row
  gateRow(gateY, bodies);

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

  // 12. (Short outro peg field removed — plain open stretch straight into
  // the final funnel instead.)

  // 13. Final funnel — MUST land at exactly 5428*S = 7599.2. Same total gap
  // the outro peg field used to fill (120*S in + its own 90*S span + 80*S
  // out = 406), now just one open span. Angle steepened to 0.32, same as
  // dark's final funnel.
  const finalFunnelY = windmillY + 406; // 7599.2 === 5428 * S
  funnelPair(finalFunnelY, 0.32, 20, bodies, 0, funnels);

  const floorY = COURSE_HEIGHT - 60;
  bodies.push(
    physics.createRectBody(centerX(floorY), floorY, tubeHalfWidthAt(floorY) * 2 + 40, 150, {
      isStatic: true,
      label: 'wall',
    })
  );

  bodies.push(...spinners.map((s) => s.body));

  return { bodies, spinners, slowZones, magnets, windVortices, funnels };
}

// 파스텔 캔디's course — a softer, bouncier candy course: one peg field (8
// rows) up front, more bumper arenas (3 vs dark's 2), a gentler slalom (4
// planks at 0.18 rad vs dark's 0.22), gate +
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
  const funnels = [];

  tubeChain(-1, bodies);
  tubeChain(1, bodies);

  // 1. Peg field 1 — 8 rows (vs dark's 7)
  pegField(150 * S, 55 * S, 8, 5, bodies); // last unscaled = 150+7*55=535

  // 2. Funnel — slightly gentler innerGap (24 vs dark's 20, MORE generous).
  // Reuses pegField->funnel gap (120). Angle steepened to 0.28 — a touch
  // gentler than dark/neon's 0.30 to keep pastel's softer identity, but
  // still enough of a pull that marbles don't just crawl to center (see
  // dark's bottleneck funnel comment for why the old 0.15 was too shallow).
  const funnelYUnscaled = 535 + 120; // 655
  funnelPair(funnelYUnscaled * S, 0.28, 24, bodies, 0, funnels);

  // 3. Bumper arena 1 — reuses funnel->bumperArena(200), internal(120)
  const bumperA1 = (funnelYUnscaled + 200) * S; // 1197
  const bumperA2 = bumperA1 + 120 * S; // 1365
  bumper(bumperA1, -0.52, bodies);
  bumper(bumperA1, 0.52, bodies);
  bumper(bumperA2, 0, bodies);

  // 4. (Peg field 2 removed — only one peg field left in this course now,
  // see item 1. pegField2Y/LastY are kept as pure Y markers so every
  // section below stays at exactly the same position.)
  const pegField2Y = bumperA2 + 120 * S; // 1533
  const pegField2LastY = pegField2Y + 7 * 45 * S; // 1974

  // 5. Bumper arena 2 — reuses pegField->bumperArena(125), internal(130)
  const bumperB1 = pegField2LastY + 125 * S; // 2149
  const bumperB2 = bumperB1 + 130 * S; // 2331
  bumper(bumperB1, -0.52, bodies);
  bumper(bumperB1, 0.52, bodies);
  bumper(bumperB2, 0, bodies);

  // 6. (Peg field 3 removed — same reasoning as peg field 2 above.)
  const pegField3Y = bumperB2 + 120 * S; // 2499
  const pegField3LastY = pegField3Y + 5 * 55 * S; // 2884

  // 7. Gate row — reuses pegField->gate(375)
  const gateY = pegField3LastY + 375 * S; // 3409
  gateRow(gateY, bodies);

  // 7b. Magnet — non-solid, safe anywhere; reuses gate->magnet(164) for
  // pacing consistency only.
  const magnetY = gateY + 164 * S; // 3638.6
  magnets.push({ x: centerX(magnetY), y: magnetY });

  // 7c. Slow zone — also non-solid (pure Y-range velocity clamp, no body),
  // placed in the open stretch after where peg field 3 used to be.
  slowZones.push({ yStart: pegField3LastY + 100 * S, yEnd: pegField3LastY + 200 * S });

  // 8. Slalom — same 4-plank count as dark now, but GENTLER (0.18 vs 0.22
  // angle), same 110*S internal spacing as dark. No tested "gate->slalom"
  // pairing exists in dark, so this uses a raw +300px gap (NOT ×S — larger
  // than any tested "into a new solid obstacle" gap except pegField->gate
  // itself, so it errs safe). This raw (non-×S) addition is required for
  // the final-funnel arithmetic below to land correctly.
  const slalomStart = gateY + 300; // 3709
  slalomPlank(slalomStart, 0.18, 1, bodies, true);
  slalomPlank(slalomStart + 110 * S, 0.18, -1, bodies);
  slalomPlank(slalomStart + 220 * S, 0.18, 1, bodies);
  slalomPlank(slalomStart + 330 * S, 0.18, -1, bodies);
  const slalomLastY = slalomStart + 330 * S; // 4171

  // 9. (Peg field 4 removed — same reasoning as peg field 2 above.)
  const pegField4Y = slalomLastY + 60 * S; // 4255
  const pegField4LastY = pegField4Y + 4 * 55 * S; // 4563

  // 10. (Bumper arena 3 removed — arenas 1, 2 and 4 stay. bumperC1/C2 are
  // kept as pure Y markers so peg field 5 below stays at exactly the same
  // position.)
  const bumperC1 = pegField4LastY + 125 * S; // 4738
  const bumperC2 = bumperC1 + 130 * S; // 4920

  // 11. (Peg field 5 removed — same reasoning as peg field 2 above.)
  const pegField5Y = bumperC2 + 120 * S; // 5088
  const pegField5LastY = pegField5Y + 7 * 55 * S; // 5627

  // 12. Bumper arena 4 (3 total vs dark's 2, since arena 3 above was
  // removed) — reuses
  // pegField->bumperArena(125), internal(120)
  const bumperD1 = pegField5LastY + 125 * S; // 5802
  const bumperD2 = bumperD1 + 120 * S; // 5970
  bumper(bumperD1, -0.52, bodies);
  bumper(bumperD1, 0.52, bodies);
  bumper(bumperD2, 0, bodies);

  // 13. (Peg field 6, the short outro, was removed — plain open stretch
  // straight into the final funnel instead.)

  // 14. Final funnel — MUST land at exactly 5428*S = 7599.2. Same total gap
  // peg field 6 used to fill (120*S in + its own 90*S span + 1335.2 out =
  // 1629.2), now just one open span — still a generous glide fitting
  // pastel's softer pacing. Angle steepened to 0.28, matching the intro
  // funnel above.
  const finalFunnelY = bumperD2 + 1629.2; // 7599.2 === 5428 * S
  funnelPair(finalFunnelY, 0.28, 20, bodies, 0, funnels);

  const floorY = COURSE_HEIGHT - 60;
  bodies.push(
    physics.createRectBody(centerX(floorY), floorY, tubeHalfWidthAt(floorY) * 2 + 40, 150, {
      isStatic: true,
      label: 'wall',
    })
  );

  bodies.push(...spinners.map((s) => s.body)); // stays empty — fine, race.js handles an empty spinners array / missing windmillGate safely

  return { bodies, spinners, slowZones, magnets, windVortices, funnels };
}
