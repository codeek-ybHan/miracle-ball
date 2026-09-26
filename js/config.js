export const COURSE_WIDTH = 980;
// Stretches the gaps between every section (and their internal spacing)
// uniformly, so the race takes longer to watch without changing any of the
// tested obstacle shapes/angles/gaps — only how far apart they sit.
export const S = 1.4;
// 5428 must match the final funnel's y in map.js's createCourse() (section
// 12) — it's not derived from there automatically, so moving that funnel
// means updating both these lines too.
export const COURSE_HEIGHT = 5428 * S + 126 + 182; // clears the final funnel + floor, whatever S is
export const GOAL_Y = 5428 * S + 126;
// Fraction of the actual window height where the followed marble is anchored
// vertically (the canvas itself is resized to the real window on every
// resize, like lazygyu/roulette's ResizeObserver-driven canvas, instead of a
// fixed-resolution buffer that gets letterboxed).
export const VIEWPORT_ANCHOR_RATIO = 0.36;

// Thickened from 12 to 24 after finding marbles occasionally tunnel clean
// through the tube boundary — see MARBLE_MAX_SPEED's comment for the general
// mechanism. The 12+16=28 margin that MARBLE_MAX_SPEED (14) was tuned
// against assumes a roughly head-on hit; a marble moving nearly TANGENT to a
// wall (which happens easily right along the tube boundary, especially once
// funnelPair's WALL_CLEARANCE gives a fast marble a real run of open space
// right next to it) sees a much smaller EFFECTIVE thickness in its direction
// of travel (thickness * sin(hit angle), well under the full 12px for a
// shallow angle) — direct simulation confirmed marbles escaping the course
// entirely through exactly this path. Doubling the thickness restores a real
// margin at shallow angles too, at the cost of a few px less playable tube
// width per side (negligible against a ~135-245px half-width) and a
// slightly chunkier-looking wall band — both fine trade-offs for "the race
// can't finish because a marble vanished."
export const WALL_THICKNESS = 24;

// The track winds left/right like a snaking tube instead of a straight lane,
// and its width itself breathes wider/narrower as it goes (out of phase with
// the left-right wave) instead of staying a constant width the whole way.
export const TUBE_HALF_WIDTH = 190; // average half-width
export const TUBE_WIDTH_VARIATION = 55; // +/- swing around the average
// These two periods scale with S along with everything else, so the course
// is always a uniform rescale of the same shape — the same number of turns
// and width-breathing cycles regardless of S, not an ever-wigglier track as
// S grows (and this keeps the wall-chain sampling resolution, tied to
// WAVE_PERIOD in map.js, from blowing up into thousands of segments).
export const TUBE_WIDTH_PERIOD = 2000 * S; // px per full narrow-wide cycle
export const WAVE_AMPLITUDE = 110;
export const WAVE_PERIOD = 1000 * S; // px per full left-right cycle

export const GRAVITY_Y = 0.9;

export const MARBLE_RADIUS = 8;
export const MARBLE_RESTITUTION = 0.7;
export const MARBLE_FRICTION = 0.02;
export const MARBLE_FRICTION_AIR = 0.008;
// Hard speed cap applied every frame. Without it, a marble that chains
// several bumper/spinner/trampoline hits can snowball into runaway velocity
// — which both makes overall pacing unpredictable (a lucky chain can blast
// through a long course almost as fast as a short one) and is what causes a
// marble to tunnel clean through a thin wall in one step. Matter's collision
// detection is discrete (checked only at each step's resolved position, not
// swept along the path), so the cap needs real margin below
// WALL_THICKNESS + marble diameter — 24 wasn't enough margin in practice
// and still let a marble through even against the old WALL_THICKNESS (12).
// See WALL_THICKNESS's own comment for the shallow-angle-hit case that
// forced that constant up too, on top of this cap.
export const MARBLE_MAX_SPEED = 14;
// Small continuous random sideways nudge so marbles on near-identical paths
// still diverge over a long fall (also breaks perfectly symmetric traps).
export const JITTER_FORCE = 0.00018;
// A pure sideways force (applied at the body's own center) produces zero
// torque, so it can never rotate a marble loose — irrelevant for a circle
// (rotation is invisible/physically inert for one), but square/hexagon
// marbles can find a genuinely STABLE rest point with a flat face resting
// against a peg's curve (unlike a circle, whose contact with a peg is
// always a single point with no flat arc to settle into) — confirmed by
// simulation: a hexagon marble found exactly this trap and sat frozen for
// the full 20000-frame test budget with the linear jitter alone doing
// nothing to it. A small continuous random torque directly perturbs
// orientation instead, which is what actually breaks a flat-face rest.
export const JITTER_TORQUE = 0.003;
// Keeps a marble from riding a long, flat stretch along the curved tube
// wall — the closer it gets to either wall, the harder it gets nudged back
// toward the centerline, growing from nothing at WALL_PUSH_MARGIN away
// down to full strength right at the wall.
export const WALL_PUSH_MARGIN = 26; // px of clearance from the wall where the push starts
export const WALL_PUSH_FORCE = 0.0004;

export const PEG_RADIUS = 15;
export const PEG_BOUNCE_MS = 180;
export const PEG_BOUNCE_SCALE = 1.7;

// Slalom plank bounce: fires on every touch (same "guarantee it directly"
// approach as the bounce pad below) so a marble always pops cleanly away
// from the plank instead of possibly grazing/sliding along it and stalling
// — see map.js's slalomPlank for the wedge-trap risk this also helps with.
// SIDE_KICK adds a randomized (both magnitude and left/right direction)
// horizontal component on top of whatever sideways drift the marble already
// had, so consecutive hits scatter every which way ("사방팔방") instead of
// each bounce just continuing whatever direction it was already drifting.
export const SLALOM_BOUNCE_MIN_SPEED = 5;
export const SLALOM_BOUNCE_SIDE_KICK = 3.5;

// Funnel walls converge at a shallow angle purely to steer marbles into the
// narrow gap, not to launch them — but Matter always resolves a collision's
// restitution as Math.max(bodyA.restitution, bodyB.restitution), so the
// funnel wall's own restitution can never make contact LESS springy than
// the marble's own MARBLE_RESTITUTION (0.7). race.js's applyFunnelDamping
// works around this by temporarily zeroing the MARBLE's own restitution
// while it's within FUNNEL_ZONE_MARGIN of any funnel's y (restored the
// instant it leaves), which is the only lever that actually works given
// Matter's max() rule. FUNNEL_ZONE_MARGIN is sized for the steepest funnel
// angle in use (see map.js) — it needs to fully cover the plank's actual
// vertical footprint (plus marble radius) at the tube's widest point, or a
// marble can bounce right at the edge of the zone where restitution hasn't
// been zeroed yet.
export const FUNNEL_RESTITUTION = 0;
export const FUNNEL_ZONE_MARGIN = 120;
// See race.js's applyFunnelDamping — the funnel plank is only 14px thick,
// thin enough that a marble arriving at full MARBLE_MAX_SPEED can tunnel
// partway into it in one physics step, and Matter's own overlap-correction
// (not restitution) then shoves it back out hard. Capped low enough that a
// worst-case single 16.7ms substep's travel stays a small fraction of that
// 14px, confirmed by direct simulation to eliminate the launch.
export const FUNNEL_MAX_SPEED = 6;
// How close (in y) a marble needs to be to a funnel's OWN plank before
// race.js's clampSpeeds actually brakes it down to FUNNEL_MAX_SPEED — much
// tighter than FUNNEL_ZONE_MARGIN (120) on purpose. That wider margin is
// safe to over-apply for restitution (it only matters at an actual
// collision, so padding it wide just means "double-check a bit early,"
// harmless), but this cap is an ACTIVE speed brake applied every single
// physics substep whether or not the marble is anywhere near the plank.
// Over the padded 120px zone, a marble just falling straight down the
// middle of the gap — nowhere near either wall — still had its natural
// gravity acceleration forcibly capped the entire time, which reads as
// fighting gravity instead of following it, and repeatedly clamping a
// marble that's ALSO touching a surface (each substep undoing whatever
// gravity/friction just added) is exactly what produces a visible rattle
// in place instead of a clean pass-through. 45 covers the plank's real
// vertical footprint (~34-40px across the angles in use — see
// funnelPair's own WALL_OVERLAP-derived geometry) plus marble radius and a
// little slop, not the full safety-padded zone.
export const FUNNEL_SPEED_CAP_MARGIN = 55;

// Gate-row posts are 80px tall (see map.js's gateRow) — this needs to cover
// the post's full vertical footprint (40px each way from its center) plus
// marble radius and a little slop, or a marble could still be caught
// between two posts right at the edge of the zone where restitution hasn't
// been zeroed yet (the same reasoning as FUNNEL_ZONE_MARGIN above).
export const GATE_ZONE_MARGIN = 60;

export const SPINNER_SPEED = 0.7; // rad/sec
export const SPINNER_LENGTH = 340;
export const WINDMILL_LENGTH = 380;
// The windmill isn't a scripted rotator like the other spinners — it starts
// as a rigid horizontal beam (isStatic) blocking the passage, and the very
// first marble to touch it flips it to a real dynamic body pinned at its
// own center every physics step (see race.js's clampSpeeds), so that
// marble's own weight is what tips it open, like a seesaw trapdoor. DENSITY
// is kept low so a single marble visibly tips it rather than barely
// budging it; FRICTION_AIR is high (well above MARBLE_FRICTION_AIR) purely
// as rotational damping so it settles down again after a hit instead of
// windmilling forever on residual momentum.
export const WINDMILL_GATE_DENSITY = 0.0006;
export const WINDMILL_GATE_FRICTION_AIR = 0.045;
export const WINDMILL_GATE_RESTITUTION = 0.3;
// Being light enough to visibly tip under one marble's weight also means a
// later marble can hit it hard enough (while it's already swinging) to spin
// it up far faster than the initial tip ever would on its own — a beam
// spinning that fast can smack a marble like a pinball flipper and launch
// it backward/upward hard enough to land it in a wall pocket well upstream,
// which a real race obviously can never recover from. Clamped the same way
// MARBLE_MAX_SPEED bounds marble speed (rad per 60fps physics step, not
// rad/sec) — high enough that the open swing and any real hit still read as
// energetic, low enough it can never turn into an out-of-control flipper.
export const WINDMILL_GATE_MAX_ANGULAR_SPEED = 0.07;

export const BUMPER_RADIUS = 22;
// Restitution above 1 is physically impossible — it hands a marble back
// MORE speed than it arrived with, purely from bouncing off a static body,
// which is exactly the "not following gravity" feel a real pinball bumper
// shouldn't have (a real one gets its punch from a solenoid, not from
// breaking energy conservation). It also compounds badly with
// MARBLE_MAX_SPEED: at 2.2, almost any real hit instantly maxes out the
// clamp, so every bumper hit reads as the same canned "TOO FAST" pop
// instead of a range of hits with real variety. 1.3 keeps bumpers clearly
// more energetic than anything else in the course (still "chaotic bounces,
// can undo a lead" — see bumper()'s own comment) without ever adding free
// energy or flattening every hit to the same speed.
export const BUMPER_RESTITUTION = 1.3;
export const BUMPER_FLASH_MS = 150;

// Bounce pad: fires instantly on every single touch. A first attempt at
// this just cranked up restitution and left it at that, but that leans on
// Matter's collision solver to stay springy over repeated bounces, and in
// practice each bounce comes back a little weaker than the last until the
// marble is just resting on the pad — the opposite of the dramatic launch
// this is supposed to be. So restitution here is just a modest cushion, and
// the real launch (see race.js's collision handler) is a direct velocity
// kick, guaranteed to send the marble flying every time regardless of how
// much speed it arrived with.
export const BOUNCE_PAD_THICKNESS = 18;
export const BOUNCE_PAD_MARGIN = 100; // kept clear of each tube wall
export const BOUNCE_PAD_RESTITUTION = 0.8;
export const BOUNCE_PAD_FRICTION = 0.05;
export const BOUNCE_PAD_FLASH_MS = 160;
// Below MARBLE_MAX_SPEED (14) on purpose now — the full-speed kick measured
// out to a ~349px bounce in practice, taller than it needed to be. 11 gives
// a still-dramatic ~234px pop with real margin to spare under the 500px gap
// to the wind vortex above.
export const BOUNCE_PAD_LAUNCH_SPEED = 11;

// Purely visual: the mat itself is drawn as a curved shape (not the raw
// rigid rectangle body) that plays a real trampoline's sink-then-spring
// motion after a hit — dips down under the "weight" of the landing, springs
// back up past neutral (bigger than the dip, for a satisfying overshoot),
// then settles back flat. None of this feeds back into the physics body,
// which stays a plain static rectangle throughout.
export const BOUNCE_PAD_SINK_MS = 90;
export const BOUNCE_PAD_SINK_DEPTH = 20; // px the mat's center dips down
export const BOUNCE_PAD_SPRING_MS = 200;
export const BOUNCE_PAD_SPRING_HEIGHT = 32; // px the mat's center springs up past neutral
export const BOUNCE_PAD_SETTLE_MS = 260;

// Magnet: not a solid body — a force zone that cycles between pulling
// nearby marbles in (most of the cycle) and shoving them back out (a short
// burst), so marbles passing through get scattered rather than parked.
// Kept in the same force scale as SLOW_ZONE_FORCE_Y/JITTER_FORCE (fractions
// of a thousandth) — an earlier version used forces ~20x larger here, which
// was enough to fling marbles clean out of the tube in a handful of frames.
export const MAGNET_RADIUS = 150;
export const MAGNET_ATTRACT_FORCE = 0.0002;
export const MAGNET_REPEL_FORCE = 0.0007;
export const MAGNET_CYCLE_MS = 1600;
export const MAGNET_REPEL_MS = 350;

// Wind vortex: also not a solid body, and cycles pull-in/burst-out the same
// way the magnet does, but adds a tangential (sideways) force on top of the
// radial pull during the "sucking in" phase — that's what makes it read as
// a swirling whirlwind circling marbles toward its center instead of a
// magnet's straight-line pull. RADIUS is sized to comfortably exceed the
// tube's half-width at the vortex's y (136px there) so every marble across
// the full width is already inside it, not just ones near the middle.
export const WIND_VORTEX_RADIUS = 180;
export const WIND_VORTEX_PULL_FORCE = 0.0003;
export const WIND_VORTEX_SWIRL_FORCE = 0.00026;
export const WIND_VORTEX_BURST_FORCE = 0.0008;
export const WIND_VORTEX_CYCLE_MS = 1900;
export const WIND_VORTEX_BURST_MS = 320;

// Slow zone: unlike the old blanket updraft this replaces, this only ever
// gets applied to whoever is CURRENTLY in 1st or 2nd place (checked live,
// every frame — see race.js's applySlowZones), so it's an actual
// rubber-band instead of something every marble passing through feels
// equally. Implemented as a straight velocity clamp (fall speed pulled down
// to this whenever it's above it) rather than an applied force — a force
// strong enough to feel dramatic can, depending on how fast the marble
// already was when it entered, overpower gravity and reverse it, and with
// several marbles hovering together and trading the "leader" penalty back
// and forth, that turned into races taking minutes or never finishing at
// all (several guarded designs around a force still couldn't rule it out).
// A clamp can't reverse anything — it only ever pulls speed down toward
// this number, never past zero — so crossing the zone is always bounded.
// The old force-based version (-0.000144) barely registered anyway (a
// marble entering at MARBLE_MAX_SPEED only dropped to ~12.5px/frame); this
// visibly stalls a leader out to a crawl, which reads as far more dramatic.
export const SLOW_ZONE_MAX_SPEED = 3;

export const CAMERA_SMOOTH_MS = 340;
// Camera stays at its base zoom for most of the race and zooms in further
// (multiplicatively) as the leader nears the goal line, up to CAMERA_MAX_ZOOM.
export const CAMERA_MAX_ZOOM = 3;
export const CAMERA_ZOOM_THRESHOLD = 600; // px from goal where the extra zoom-in starts ramping up
// Base zoom is picked so the tube fills this fraction of the real window
// width — the physics/course coordinates never change, only how large they
// render, so the track always uses the full screen instead of sitting as a
// small strip in the middle on wide windows.
export const CAMERA_BASE_FILL_RATIO = 0.4;
export const CAMERA_BASE_MIN = 1.2;
export const CAMERA_BASE_MAX = 3;

// Three named palettes a player can pick on the setup screen (see ui.js's
// bindThemeButtons / main.js's theme wiring) — 'dark' is the original,
// unchanged look and stays the default. COLORS itself is a single mutable
// object rather than a plain constant: renderer.js/race.js/map.js/
// particleManager.js all read it as COLORS.xxx at draw/spawn time (never
// destructured into their own local consts), so Object.assign-ing a new
// palette into it propagates everywhere live with no per-file changes
// needed. Every palette keeps a dark-ish background/courseBg on purpose —
// the setup screen's own CSS chrome (text, borders) is a separate hardcoded
// dark palette that isn't theme-aware, so a truly light theme would need a
// parallel CSS system; staying dark-based here means it just stays legible
// for free.
const THEMES = {
  dark: {
    background: '#05060f',
    courseBg: '#161c47',
    wall: '#454f8c',
    wallEdge: '#6c78c9',
    peg: '#8891d6',
    spinner: '#ff8a5c',
    spinnerEdge: '#ffd0b8',
    windmill: '#ff5c8a',
    windmillEdge: '#ffc2d6',
    bumper: '#ff3d81',
    bumperRing: '#ff9dc0',
    bumperFlash: '#ffffff',
    bouncePad: '#ffd93d',
    bouncePadEdge: '#fff2b8',
    bouncePadFlash: '#ffffff',
    magnet: '#b892ff',
    magnetCore: '#e8dbff',
    magnetRepel: '#ff6b6b',
    slowZone: 'rgba(94, 224, 255, 0.09)',
    windVortex: '#5ee0ff',
    windVortexCore: '#e0faff',
    windVortexBurst: '#ffffff',
    goalLine: '#5ee0ff',
    spark: '#ffe066',
    text: '#f4f6ff',
  },
  neon: {
    background: '#040007',
    courseBg: '#0d0221',
    wall: '#3a1c71',
    wallEdge: '#d726ff',
    peg: '#00f0ff',
    spinner: '#ff00c8',
    spinnerEdge: '#ff8ae8',
    windmill: '#00ffa2',
    windmillEdge: '#9dffde',
    bumper: '#ff003c',
    bumperRing: '#ff7a9e',
    bumperFlash: '#ffffff',
    bouncePad: '#faff00',
    bouncePadEdge: '#fbffb0',
    bouncePadFlash: '#ffffff',
    magnet: '#8f00ff',
    magnetCore: '#e2b8ff',
    magnetRepel: '#ff2079',
    slowZone: 'rgba(0, 240, 255, 0.1)',
    windVortex: '#00e5ff',
    windVortexCore: '#e0ffff',
    windVortexBurst: '#ffffff',
    goalLine: '#00e5ff',
    spark: '#faff00',
    text: '#f5f5ff',
  },
  pastel: {
    background: '#140d26',
    courseBg: '#2a2048',
    wall: '#7d6fa8',
    wallEdge: '#c9b8ea',
    peg: '#ffc2e0',
    spinner: '#ffb6c1',
    spinnerEdge: '#ffe1e8',
    windmill: '#b8f0d1',
    windmillEdge: '#e3fff0',
    bumper: '#ff9ecf',
    bumperRing: '#ffd3ea',
    bumperFlash: '#ffffff',
    bouncePad: '#fff3a0',
    bouncePadEdge: '#fffbdc',
    bouncePadFlash: '#ffffff',
    magnet: '#c9b8ff',
    magnetCore: '#ece3ff',
    magnetRepel: '#ff8a8a',
    slowZone: 'rgba(255, 194, 224, 0.12)',
    windVortex: '#9adcf0',
    windVortexCore: '#ffffff',
    windVortexBurst: '#ffffff',
    goalLine: '#a0e8c0',
    spark: '#ffd97d',
    text: '#f4f6ff',
  },
};

export const THEME_LIST = [
  { id: 'dark', label: '다크 스페이스' },
  { id: 'neon', label: '네온 사이버' },
  { id: 'pastel', label: '파스텔 캔디' },
];

export const COLORS = { ...THEMES.dark };

export function applyTheme(themeId) {
  Object.assign(COLORS, THEMES[themeId] ?? THEMES.dark);
}

// Per-theme marble COLLISION shape (not just color) — kept separate from
// THEMES/COLORS since 'shape' isn't a color key. 'circle' (dark) is the
// exact unchanged Matter.Bodies.circle marble; 'square'/'hexagon' use
// Matter.Bodies.polygon via physics.js's createMarbleBody. Deliberately no
// concave/star shape — see physics.js's comment for why.
export const THEME_SHAPES = {
  dark: 'circle',
  neon: 'square',
  pastel: 'hexagon',
};

export function getThemeShape(themeId) {
  return THEME_SHAPES[themeId] ?? 'circle';
}
