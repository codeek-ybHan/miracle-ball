export const COURSE_WIDTH = 980;
// Stretches the gaps between every section (and their internal spacing)
// uniformly, so the race takes longer to watch without changing any of the
// tested obstacle shapes/angles/gaps — only how far apart they sit.
export const S = 1.4;
export const COURSE_HEIGHT = 4200 * S + 126 + 182; // clears the final funnel + floor, whatever S is
export const GOAL_Y = 4200 * S + 126;
// Fraction of the actual window height where the followed marble is anchored
// vertically (the canvas itself is resized to the real window on every
// resize, like lazygyu/roulette's ResizeObserver-driven canvas, instead of a
// fixed-resolution buffer that gets letterboxed).
export const VIEWPORT_ANCHOR_RATIO = 0.36;

export const WALL_THICKNESS = 12;

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
// WALL_THICKNESS + marble diameter (12+16=28), not just barely under it —
// 24 wasn't enough margin in practice and still let a marble through.
export const MARBLE_MAX_SPEED = 14;
// Small continuous random sideways nudge so marbles on near-identical paths
// still diverge over a long fall (also breaks perfectly symmetric traps).
export const JITTER_FORCE = 0.00018;

export const PEG_RADIUS = 11;
export const PEG_BOUNCE_MS = 180;
export const PEG_BOUNCE_SCALE = 1.7;

export const SPINNER_SPEED = 1.1; // rad/sec
export const SPINNER_LENGTH = 280;
export const WINDMILL_SPEED = 0.7; // rad/sec
export const WINDMILL_LENGTH = 380;

export const BUMPER_RADIUS = 22;
export const BUMPER_RESTITUTION = 2.2;
export const BUMPER_FLASH_MS = 150;

// Trampoline: a flat static platform marbles land and settle on (low
// restitution, high friction, like a normal floor) — it's a gathering spot,
// not an instant-bounce obstacle. Once enough racers are resting on it at
// once, they all launch together in one burst and the platform disappears,
// so anyone arriving afterward just falls through empty space. Kept
// narrower than the tube's narrowest point with plenty of margin so it
// never touches a wall.
export const TRAMPOLINE_WIDTH = 150;
// A modest thickness bump over a bare minimum is still useful as one extra
// layer of margin for the instant of impact, but it's race.js explicitly
// pinning resting marbles in place (see checkTrampolines) that actually
// stops them from sinking through over their long wait — thickness alone
// only delays that, since gravity keeps acting on a body Matter is merely
// resolving imperfectly each step rather than holding at rest.
export const TRAMPOLINE_THICKNESS = 22;
// Low restitution so a marble landing on top settles instead of bouncing —
// raising this made things worse, not better: a bouncing marble hitting a
// thin (16px) slab repeatedly under gravity sinks deeper into it each cycle
// (Matter's solver doesn't fully resolve overlap in one step), so the real
// fix for marbles penetrating the platform is a thicker slab (below), not a
// bouncier one.
export const TRAMPOLINE_RESTITUTION = 0.15;
export const TRAMPOLINE_FRICTION = 0.7;
export const TRAMPOLINE_TRIGGER_RATIO = 0.2; // fraction of all racers needed to fire
export const TRAMPOLINE_TRIGGER_MIN = 2; // never require fewer than this many
export const TRAMPOLINE_REST_VELOCITY = 1.5; // px/step below which a marble counts as settled
// Safety valve: most marbles fall past the trampoline entirely (it's
// narrower than the tube), so if the group never fills up, whoever IS
// resting still launches after this long instead of waiting forever.
export const TRAMPOLINE_MAX_WAIT_MS = 4000;
// Applied as a direct velocity kick (not restitution) when the group
// launches, so it's a guaranteed clean escape regardless of how gently
// everyone was resting a moment before. Kept at MARBLE_MAX_SPEED so the
// launch isn't a loophole around the per-frame speed cap.
export const TRAMPOLINE_LAUNCH_SPEED = 14;

// Magnet: not a solid body — a force zone that cycles between pulling
// nearby marbles in (most of the cycle) and shoving them back out (a short
// burst), so marbles passing through get scattered rather than parked.
// Kept in the same force scale as WIND_FORCE_Y/JITTER_FORCE (fractions of a
// thousandth) — an earlier version used forces ~20x larger here, which was
// enough to fling marbles clean out of the tube in a handful of frames.
export const MAGNET_RADIUS = 150;
export const MAGNET_ATTRACT_FORCE = 0.0002;
export const MAGNET_REPEL_FORCE = 0.0007;
export const MAGNET_CYCLE_MS = 1600;
export const MAGNET_REPEL_MS = 350;

// Kept weaker than gravity (scaled with it) so marbles are slowed, never levitated.
export const WIND_FORCE_Y = -0.000144;

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

export const COLORS = {
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
  trampoline: '#caff70',
  trampolineEdge: '#eaffc2',
  trampolineFlash: '#ffffff',
  magnet: '#b892ff',
  magnetCore: '#e8dbff',
  magnetRepel: '#ff6b6b',
  wind: 'rgba(94, 224, 255, 0.09)',
  goalLine: '#5ee0ff',
  spark: '#ffe066',
  text: '#f4f6ff',
};
