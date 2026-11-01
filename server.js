import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { ARENA, FIRE, COVER, SPAWNS, PICKUPS, RULES, clampArena } from './public/map.js';

const PORT = Number(process.env.PORT) || 3000;
const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const COLORS = ['#2c6b88', '#b8462e', '#5b8a3a', '#7a4fa0', '#c08a1e', '#2f8f7a', '#b04a78', '#4a5fb0', '#8a6a4a', '#d0d4dc', '#3c3f48', '#e07a9a'];

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/health') { res.writeHead(200).end('ok'); return; }
  const file = path.join(PUB, path.normalize(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
const rooms = new Map();
let nextId = 1, nextBall = 1;

const r2 = v => Math.round(v * 100) / 100;
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
function broadcast(room, m, exceptId = 0) {
  const s = JSON.stringify(m);
  for (const p of room.players.values()) if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(s);
}
const pub = p => ({ id: p.id, name: p.name, color: p.color, x: r2(p.x), z: r2(p.z), f: r2(p.f), hp: Math.ceil(p.hp), alive: p.alive, kills: p.kills, deaths: p.deaths, s: p.seq });

function getRoom(name) {
  let r = rooms.get(name);
  if (!r) {
    r = { name, players: new Map(), balls: [], pickups: PICKUPS.map(([x, z], id) => ({ id, x, z, up: true, next: 0 })) };
    rooms.set(name, r);
  }
  return r;
}

// spawn at the point farthest from living opponents
function spawn(room, p) {
  const others = [...room.players.values()].filter(o => o !== p && o.alive);
  let best = SPAWNS[0], bestD = -1;
  for (const s of SPAWNS) {
    const d = others.length ? Math.min(...others.map(o => Math.hypot(o.x - s[0], o.z - s[1]))) : Math.random() * 10;
    if (d > bestD) { bestD = d; best = s; }
  }
  const now = Date.now();
  Object.assign(p, { x: best[0], z: best[1], hp: RULES.hp, alive: true, protect: now + RULES.protect * 1000, seq: p.seq + 1, lastSt: now, balls: RULES.maxBalls, ballAcc: 0, kvx: 0, kvz: 0 });
}

// w: 'ball' | 'punch'; kx/kz: knockback direction for punches
function damage(room, victim, attacker, dmg, w, kx = 0, kz = 0) {
  const now = Date.now();
  if (!victim.alive || victim.protect > now) return;
  victim.hp -= dmg;
  if (victim.hp > 0) {
    broadcast(room, { t: 'hit', id: victim.id, by: attacker.id, hp: Math.ceil(victim.hp), w, kx: r2(kx), kz: r2(kz) });
    return;
  }
  victim.hp = 0; victim.alive = false; victim.deaths++; victim.respawnAt = now + RULES.respawn * 1000;
  attacker.kills++;
  broadcast(room, { t: 'kill', id: victim.id, by: attacker.id, k: attacker.kills, d: victim.deaths, w });
}

wss.on('connection', ws => {
  let me = null, room = null;
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'join' && !me) {
      const rname = String(m.room || 'beach').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'beach';
      room = getRoom(rname);
      if (room.players.size >= RULES.maxPlayers) { send(ws, { t: 'full' }); ws.close(); return; }
      const used = new Set([...room.players.values()].map(p => p.color));
      const name = String(m.name || '').replace(/\s+/g, ' ').trim().slice(0, 12) || `손님${nextId}`;
      me = { id: nextId++, name, color: COLORS.find(c => !used.has(c)) || COLORS[0], x: 0, z: 0, f: 0, m: 0, hp: RULES.hp, alive: true, protect: 0, respawnAt: 0, kills: 0, deaths: 0, lastThrow: 0, lastPunch: 0, seq: 0, lastSt: 0, balls: RULES.maxBalls, ballAcc: 0, ws };
      spawn(room, me);
      room.players.set(me.id, me);
      send(ws, { t: 'welcome', id: me.id, room: rname, players: [...room.players.values()].map(pub), pickups: room.pickups.map(k => k.up ? 1 : 0) });
      broadcast(room, { t: 'join', p: pub(me) }, me.id);
      return;
    }
    if (!me || !me.alive) return;
    const now = Date.now();

    if (m.t === 'st') {
      if (m.s !== me.seq) return;
      const dt = Math.min(0.5, Math.max(0.016, (now - me.lastSt) / 1000));
      me.lastSt = now;
      let x = Number(m.x), z = Number(m.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz), maxD = RULES.dashSpeed * 1.1 * dt + 0.4;
      if (d > maxD) { x = me.x + dx / d * maxD; z = me.z + dz / d * maxD; }
      const p = clampArena({ x, z });
      me.x = p.x; me.z = p.z;
      me.f = Number(m.f) || 0;
      me.m = m.m ? 1 : 0;
      return;
    }

    if (m.t === 'throw') {
      if (me.balls <= 0 || now - me.lastThrow < RULES.throwInterval * 1000 * 0.8) return;
      let dx = Number(m.dx), dz = Number(m.dz);
      const l = Math.hypot(dx, dz);
      if (!l || !Number.isFinite(l)) return;
      dx /= l; dz /= l;
      let ox = Number(m.x), oz = Number(m.z);
      if (!Number.isFinite(ox) || !Number.isFinite(oz) || Math.hypot(ox - me.x, oz - me.z) > 2) { ox = me.x; oz = me.z; }
      me.lastThrow = now; me.balls--;
      const b = { b: nextBall++, owner: me, x: ox, z: oz, vx: dx * RULES.ballSpeed, vz: dz * RULES.ballSpeed, life: RULES.ballLife };
      room.balls.push(b);
      broadcast(room, { t: 'ball', b: b.b, id: me.id, c: m.c | 0, x: r2(ox), z: r2(oz), vx: r2(b.vx), vz: r2(b.vz) });
      return;
    }

    if (m.t === 'punch') {
      if (now - me.lastPunch < RULES.punchCd * 1000 * 0.9) return;
      me.lastPunch = now;
      const f = Number(m.f);
      const fx = Math.sin(Number.isFinite(f) ? f : me.f), fz = Math.cos(Number.isFinite(f) ? f : me.f);
      let best = null, bd = RULES.punchRange + RULES.playerR;
      for (const p of room.players.values()) {
        if (p === me || !p.alive) continue;
        const dx = p.x - me.x, dz = p.z - me.z, d = Math.hypot(dx, dz);
        if (d > bd) continue;
        if (d > 0.4 && (dx * fx + dz * fz) / d < 0.4) continue;
        best = p; bd = d;
      }
      broadcast(room, { t: 'punch', id: me.id, v: best ? best.id : 0 }, me.id);
      if (best) {
        const dx = best.x - me.x, dz = best.z - me.z, d = Math.hypot(dx, dz) || 1;
        damage(room, best, me, RULES.punchDmg, 'punch', dx / d, dz / d);
      }
    }
  });

  ws.on('close', () => {
    if (!me || !room) return;
    room.players.delete(me.id);
    broadcast(room, { t: 'leave', id: me.id });
    if (!room.players.size) rooms.delete(room.name);
  });
});

const TICK = 50, SUB = 5;
function stepBalls(room) {
  const dt = TICK / 1000 / SUB, hitR = RULES.playerR + RULES.ballR;
  for (let s = 0; s < SUB; s++) {
    for (const b of room.balls) {
      if (b.done) continue;
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      let victim = null, end = b.life <= 0 || b.x < ARENA.xMin - 4 || b.x > ARENA.xMax + 4 || b.z < ARENA.zMin - 4 || b.z > ARENA.zMax + 4;
      if (!end) for (const c of COVER) {
        if (!c.low && (b.x - c.x) ** 2 + (b.z - c.z) ** 2 < (c.r + RULES.ballR) ** 2) { end = true; break; }
      }
      if (!end) for (const p of room.players.values()) {
        if (p === b.owner || !p.alive) continue;
        if ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 < hitR * hitR) { victim = p; end = true; break; }
      }
      if (!end) continue;
      b.done = true;
      broadcast(room, { t: 'bend', b: b.b, x: r2(b.x), z: r2(b.z), v: victim ? victim.id : 0 });
      if (victim && room.players.has(b.owner.id)) damage(room, victim, b.owner, RULES.ballDmg, 'ball');
    }
  }
  room.balls = room.balls.filter(b => !b.done);
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    stepBalls(room);
    for (const p of room.players.values()) {
      if (!p.alive) {
        if (now >= p.respawnAt) { spawn(room, p); broadcast(room, { t: 'spawn', id: p.id, x: p.x, z: p.z, s: p.seq }); }
        continue;
      }
      if (p.balls < RULES.maxBalls) {
        p.ballAcc += TICK;
        if (p.ballAcc >= RULES.ballRegen * 1000) { p.balls++; p.ballAcc = 0; }
      } else p.ballAcc = 0;
      if (p.hp < RULES.hp && Math.hypot(p.x - FIRE.x, p.z - FIRE.z) < FIRE.regenR) p.hp = Math.min(RULES.hp, p.hp + RULES.regen * TICK / 1000);
      for (const k of room.pickups) {
        if (k.up && p.hp < RULES.hp && (p.x - k.x) ** 2 + (p.z - k.z) ** 2 < 1.6 ** 2) {
          k.up = false; k.next = now + RULES.pickupEvery * 1000;
          p.hp = Math.min(RULES.hp, p.hp + RULES.pickupHeal);
          broadcast(room, { t: 'pick', k: k.id, id: p.id });
        }
      }
    }
    for (const k of room.pickups) if (!k.up && now >= k.next) { k.up = true; broadcast(room, { t: 'pkup', k: k.id }); }
    broadcast(room, { t: 'snap', ps: [...room.players.values()].map(p => [p.id, r2(p.x), r2(p.z), r2(p.f), p.m, Math.ceil(p.hp), p.alive ? 1 : 0, p.protect > now ? 1 : 0, p.balls]) });
  }
}, TICK);

server.listen(PORT, () => console.log(`snowball fight on http://localhost:${PORT}`));
