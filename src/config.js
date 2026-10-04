// All tunables live here. Nothing gameplay-related should be a magic number elsewhere.
// World units are logical pixels. +y is DOWN, so "up" in the world is negative y.

// Zone start heights in metres (release values: Red 1000, Black 2000).
// Override in the URL for quick testing, e.g. ?rz=100&bz=300 (Node tests use the RZ / BZ env vars).
const urlNum = (key) =>
  (typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get(key)) : typeof process !== 'undefined' ? Number(process.env[key.toUpperCase()]) : 0) || 0;
// Release values. For quick testing add ?rz=100&bz=300 to the URL.
const RZ_FROM_M = urlNum('rz') || 1000;
const BZ_FROM_M = urlNum('bz') || 2000;
const PZ_FROM_M = urlNum('pz') || 3000;
const DARK_FLOOR = urlNum('dark') || 0.12; // ?dark=0.5 -> brighter far-away bodies while tuning the Black Zone

export const CFG = {
  W: 360,
  H: 640,
  // render scale: the canvas is W*Z by H*Z, art is authored in logical units. ?z=1 renders at half size (fast tests / low-end fallback)
  Z: (typeof location !== 'undefined' && Number(new URLSearchParams(location.search).get('z'))) || 2,

  physics: {
    gravity: 1500,        // px/s^2
    jumpVy: 540,          // upward speed given by EVERY tap (ground or air) px/s -> ~97px per tap
    lateralVx: 150,       // sideways speed set by a left/right tap px/s (centre tap = 0)
    maxFall: 760,         // terminal fall speed px/s
    landTol: 6,           // extra horizontal forgiveness when landing on a platform edge
    step: 1 / 120,        // fixed simulation step (never tied to render FPS)
    stunSeconds: 0.45,    // flinch after a hazard hit
    stunTapAfter: 0.25,   // taps work again this long after a hit
  },

  player: {
    halfW: 11,            // collision half width
    feet: 20,             // distance from body centre down to the feet
    hurtR: 11,            // hazard collision radius
  },

  input: {
    zones: [1 / 3, 2 / 3], // viewport-relative split between left | centre | right
  },

  lives: 3,
  invulnSeconds: 1.6,     // after a hit
  spawnProtect: 1.2,      // after respawn
  reviveProtect: 2.0,     // after a rewarded revive
  reviveLives: 1,         // lives granted by a normal rewarded revive
  coinRevive: { cost: 1000, lives: 1 }, // second revive, only after the ad revive is used; paid with coins (1000 coins = RM 1.00 hidden value)
  normalReviveMax: 1,
  airSpawnHold: 0.6,      // seconds a mid-air respawn hovers before gravity resumes

  score: { pxPerMetre: 20 },
  coinsPerPickup: 5,      // wallet coins per coin collected (economy tuning knob; see src/data/cosmetics.js for prices)

  camera: {
    followY: 0.42,        // player is kept at/above this fraction of screen height
    smooth: 8,            // follow smoothing (1/s)
    deathMargin: 36,      // px below the visible bottom before a fall counts
  },

  gen: {
    startY: 470,          // top of the starting platform
    sliceH: 260,          // the world is generated in slices this tall
    aheadPx: 900,         // generate this far above the camera
    keepBelowPx: 360,     // free objects this far below the camera
    firstClear: 300,      // empty runway above the start ledge
    ledgeClear: 150,      // no hazards this close (vertically) to a rest ledge
    hazardGapMin: 54,     // hazards never sit closer than this to each other
    coinTrailChance: 0.55,
  },

  // Difficulty bands by height (metres). Last matching band wins.
  //  half     = half-width of the guaranteed safe corridor (player centre can wander +/- this far)
  //  slope    = how fast the corridor may drift sideways (px sideways per px climbed)
  //  spacing  = vertical distance between hazard levels
  //  hzP      = chance a hazard level is used; gateP = chance it is a two-sided gate
  //  moving   = share of hazards that sweep sideways; slackMax = extra room beyond the minimum gap
  //  ledgeEvery = vertical distance between rest ledges
  bands: [
    { fromM: 0,   half: 56, slope: 0.30, spacing: [260, 300], hzP: 0,    gateP: 0.3,  moving: 0,    slackMax: 90, kinds: ['rock'],                 ledgeEvery: [760, 900],   ledgeW: [120, 150] },
    { fromM: 30,  half: 52, slope: 0.34, spacing: [230, 290], hzP: 0.85, gateP: 0.35, moving: 0,    slackMax: 80, kinds: ['rock'],                 ledgeEvery: [760, 900],   ledgeW: [118, 146] },
    { fromM: 100, half: 46, slope: 0.38, spacing: [190, 250], hzP: 0.9,  gateP: 0.45, moving: 0.2,  slackMax: 70, kinds: ['rock', 'lava'],        ledgeEvery: [820, 980],   ledgeW: [112, 140] },
    { fromM: 250, half: 44, slope: 0.40, spacing: [150, 210], hzP: 0.95, gateP: 0.55, moving: 0.35, slackMax: 60, kinds: ['rock', 'lava', 'mine'], ledgeEvery: [900, 1080],  ledgeW: [106, 134] },
    { fromM: 500, half: 40, slope: 0.42, spacing: [120, 170], hzP: 1,    gateP: 0.65, moving: 0.5,  slackMax: 50, kinds: ['rock', 'lava', 'mine'], ledgeEvery: [980, 1180],  ledgeW: [100, 128] },
    { fromM: 900, half: 36, slope: 0.44, spacing: [100, 150], hzP: 1,    gateP: 0.7,  moving: 0.6,  slackMax: 40, kinds: ['rock', 'lava', 'mine'], ledgeEvery: [1050, 1250], ledgeW: [96, 122] },
  ],

  // RED ZONE: once a run passes fromM metres the sky turns red, coins count double, the corridor tightens a little
  // and wall-mounted Spitters appear. It stays on for the rest of the run.
  redZone: {
    fromM: RZ_FROM_M,
    fadeM: 100,           // the sky fades red over this many metres BEFORE fromM
    coinMult: 1.5,
    halfShrink: 3,        // safe corridor half-width shrinks by this much (never below minHalf)
    minHalf: 32,
    spacingMul: 0.9,      // hazard levels sit a bit closer together
    movingAdd: 0.08,      // more sweeping hazards
    movingMax: 0.7,
    shooterEvery: [380, 560], // vertical distance between Spitters (about 1 hazard level in 4)
    shooterGapY: 120,     // no other hazard within this vertical distance of a Spitter
  },
  // BLACK ZONE: past fromM the lights go out. Same level layout as the Red Zone (the safe corridor is untouched);
  // the difficulty is visibility. Fairness rules: every threat always keeps a glowing outline drawn at its true
  // hit radius, the alien carries a lantern, and orbs / coins stay fully lit.
  blackZone: {
    fromM: BZ_FROM_M,
    fadeM: 100,           // the sky drains to black over this many metres BEFORE fromM
    darkRampM: 30,        // outlines + lantern ramp in over the last stretch before fromM
    coinMult: 2,
    floor: DARK_FLOOR,    // body brightness of a hazard far from the lantern (0..1). The outline is always on top.
    floorSpitter: 0.3,
    floorPlat: 0.3,
    rimFar: 0.38,         // outline strength far from the lantern
    rimNear: 0.25,         // inside the lantern the body is readable, so the outline eases off
    lanternR: 105,        // full light inside lanternR/2, fading out to lanternR
    lanternUp: 150,       // the light reaches further above the alien than below
    lanternDown: 85,
    lanternAlpha: 0.22,
    rim: { rock: 0x9db4ff, lava: 0xffa23c, mine: 0xff7e60, spitter: 0xff7a64 },
    edge: [0xffc457, 0x8fd8ff, 0xb99cff], // ledge top-edge light per theme (amber, ice, violet)
  },
  // PHANTOM ZONE: past fromM everything of the Black Zone stays (darkness, lantern, outlines) and a black hole
  // hangs behind the level. Every few seconds it pulls: first a telegraphed warning (no force), then a sideways pull
  // toward the hole that can be countered by tapping away from it. The level layout itself is unchanged.
  // Ads. These are Google's public TEST ids; swap for the real ids (and set testing:false) after the AdMob account exists.
  ads: {
    testing: true,
    rewardedId: 'ca-app-pub-3940256099942544/5224354917',
  },
  phantomZone: {
    fromM: PZ_FROM_M,
    fadeM: 60,            // the hole fades in over this many metres BEFORE fromM
    coinMult: 2.5,        // the cap: no zone pays more, however deep the run goes
    levelM: urlNum('pzstep') || 1000, // every this many metres past fromM the hole gets stronger
    strength: [1, 2, 2.4], // pull multiplier per level (level 0 = 3000 m); the last value holds for deeper levels.
                           // 2.4 x 62 = 149 px/s is just under a tap's 150 px/s, so tapping away always still wins.
    calmShrink: 0.9,      // from level 2 on, the calm gaps shrink by this factor per level...
    calmMin: 0.6,         // ...down to this fraction of the base gap
    firstCalmS: 3.5,      // grace after entering the zone, before the first pull
    calmS: [4.5, 6.5],    // calm time between pulls (seeded)
    warnS: 1.2,           // telegraph: the hole brightens, edge arrows sweep toward it. No force yet.
    pullS: 1.9,           // total pull time (ramp in, hold, ramp out)
    rampInS: 0.35,
    rampOutS: 0.5,
    maxVx: 62,            // peak sideways pull in px/s. A tap away from the hole moves 150 px/s, so it is always beatable.
  },
  // Spitter: a wall cannon that fires ONE slow orb along its row, always the same direction.
  shooter: {
    speed: 100,           // orb speed px/s (player sidesteps at 150)
    r: 6,                 // orb hit radius (added to the player's hurt radius)
    warn: 0.7,            // glow + dotted lane before every shot (s)
    period: [2.6, 3.4],   // seconds between shots, per Spitter
    activeAbove: 360,     // starts its cycle this far above the screen, so orbs are already flying when its row scrolls in
    firstDelay: [0.4, 1.4],
  },

  hazards: {
    rock: { r: 13, tex: 'haz_rock' },
    spitter: { r: 14, tex: 'haz_spitter' },
    lava: { r: 13, tex: 'haz_lava' },
    mine: { r: 14, tex: 'haz_mine' },
  },

  themes: ['amber', 'ice', 'violet'],
  themeEveryM: 250,

  hudTop: 18,             // extra top inset; Capacitor build can raise this for notches
};
