export const COURSE_WIDTH = 980;
// Stretches the gaps between every section (and their internal spacing)
// uniformly, so the race takes longer to watch without changing any of the
// tested obstacle shapes/angles/gaps — only how far apart they sit.
export const S = 1.4;
// 4760 must match the final funnel's y in map.js's createCourse() (section
// 12) — it's not derived from there automatically, so moving that funnel
// means updating both these lines too.
export const COURSE_HEIGHT = 4760 * S + 126 + 182; // clears the final funnel + floor, whatever S is
export const GOAL_Y = 4760 * S + 126;
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
// Keeps a marble from riding a long, flat stretch along the curved tube
// wall — the closer it gets to either wall, the harder it gets nudged back
// toward the centerline, growing from nothing at WALL_PUSH_MARGIN away
// down to full strength right at the wall.
export const WALL_PUSH_MARGIN = 26; // px of clearance from the wall where the push starts
export const WALL_PUSH_FORCE = 0.0004;

export const PEG_RADIUS = 15;
export const PEG_BOUNCE_MS = 180;
export const PEG_BOUNCE_SCALE = 1.7;

export const SPINNER_SPEED = 0.7; // rad/sec
export const SPINNER_LENGTH = 340;
export const WINDMILL_SPEED = 0.45; // rad/sec
export const WINDMILL_LENGTH = 380;

export const BUMPER_RADIUS = 22;
export const BUMPER_RESTITUTION = 2.2;
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
// Kept at MARBLE_MAX_SPEED: the launch is a guaranteed full-height pop, not
// a loophole around the per-frame speed cap every marble is already held to
// everywhere else.
export const BOUNCE_PAD_LAUNCH_SPEED = 14;

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
// Kept in the same force scale as WIND_FORCE_Y/JITTER_FORCE (fractions of a
// thousandth) — an earlier version used forces ~20x larger here, which was
// enough to fling marbles clean out of the tube in a handful of frames.
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
  bouncePad: '#ffd93d',
  bouncePadEdge: '#fff2b8',
  bouncePadFlash: '#ffffff',
  magnet: '#b892ff',
  magnetCore: '#e8dbff',
  magnetRepel: '#ff6b6b',
  wind: 'rgba(94, 224, 255, 0.09)',
  windVortex: '#5ee0ff',
  windVortexCore: '#e0faff',
  windVortexBurst: '#ffffff',
  goalLine: '#5ee0ff',
  spark: '#ffe066',
  text: '#f4f6ff',
};
