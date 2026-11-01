// Shared by the server (snowball and punch checks) and the client (drawing, movement).

export const ARENA = { xMin: -28, xMax: 28, zMin: -11, zMax: 22 };
export const FIRE = { x: 0, z: 4, r: 1.15, regenR: 3.6 };
export const WATER_Y = -0.35;

export const RULES = {
  hp: 100,
  ballDmg: 20,
  ballSpeed: 22,
  ballLife: 0.9,
  ballR: 0.2,
  maxBalls: 6,
  ballRegen: 0.7,
  throwInterval: 0.26,
  punchDmg: 25,
  punchRange: 1.8,
  punchCd: 0.55,
  knock: 14,
  playerR: 0.55,
  respawn: 3,
  protect: 1.5,
  regen: 6,
  pickupHeal: 35,
  pickupEvery: 15,
  speed: 7.2,
  dashSpeed: 24,
  maxPlayers: 12
};

// low: blocks walking but not snowballs
export const COVER = [
  { k: 'fire', x: FIRE.x, z: FIRE.z, r: FIRE.r, low: true },
  { k: 'rock', x: -14, z: -4, r: 1.6 },
  { k: 'rock', x: 13, z: -5, r: 1.5 },
  { k: 'rock', x: -6, z: 13, r: 1.3 },
  { k: 'rock', x: 8, z: 14, r: 1.4 },
  { k: 'rock', x: -22, z: 6, r: 1.8 },
  { k: 'rock', x: 21, z: 7, r: 1.7 },
  { k: 'rock', x: 0, z: -7, r: 1.2 },
  { k: 'crate', x: -9, z: 3, r: 0.9 },
  { k: 'crate', x: 9, z: 2, r: 0.9 },
  { k: 'crate', x: -17, z: 16, r: 1 },
  { k: 'crate', x: 17, z: 17, r: 1 },
  { k: 'crate', x: -3, z: 19, r: 0.9 },
  { k: 'crate', x: 24, z: -3, r: 1 },
  { k: 'crate', x: -25, z: -4, r: 1 },
  { k: 'pine', x: -24, z: 19, r: 0.5 },
  { k: 'pine', x: 22, z: 20, r: 0.5 },
  { k: 'pine', x: -11, z: 7, r: 0.5 },
  { k: 'pine', x: 12, z: 9, r: 0.5 }
];

export const SPAWNS = [
  [-24, -9], [24, -9], [-25, 12], [25, 12], [0, 20], [-12, 20], [12, 20], [0, -9.5]
];

export const PICKUPS = [[-16, 9], [16, 9], [0, 15], [-7, -9], [7, -9]];

export function sandH(x, z) {
  let h = 0.1 * Math.sin(x * 0.35 + z * 0.2) * Math.cos(z * 0.27 - x * 0.11) + 0.04 * Math.sin(x * 1.3 + z * 0.9);
  if (z < -10) h -= (-10 - z) * 0.16;
  return h;
}

export function clampArena(p) {
  p.x = Math.max(ARENA.xMin, Math.min(ARENA.xMax, p.x));
  p.z = Math.max(ARENA.zMin, Math.min(ARENA.zMax, p.z));
  for (const c of COVER) {
    const dx = p.x - c.x, dz = p.z - c.z, min = c.r + 0.45, d = Math.hypot(dx, dz);
    if (d < min) { const k = d ? min / d : 0; p.x = c.x + (d ? dx * k : min); p.z = c.z + dz * k; }
  }
  return p;
}
