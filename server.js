// BLOCKBOX multiplayer server — Node + Express + Socket.IO (runs on Render).
// The server hosts rooms ("servers"), relays player state and events, and
// migrates the host when the host leaves. Game simulation (zombie waves, round
// logic) runs in the host's browser; the server validates and relays.
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const MAX_ROOMS = 100;
const app = express();
const srv = http.createServer(app);
const io = new Server(srv, {
  maxHttpBufferSize: 1e5,
  pingInterval: 10000,
  pingTimeout: 20000,
  cors: { origin: process.env.CORS_ORIGIN || false },
});

app.disable('x-powered-by');
app.get('/health', (_q, r) => r.send('ok'));
const page = path.join(__dirname, 'index.html'); // only the game page is public (server.js etc. are not served)
app.get(['/', '/index.html'], (_q, r) => r.sendFile(page));

const rooms = new Map(); // code -> { code, title, max, host, m, peers: Map(id -> {id, p}) }
const clean = (s, n) => String(s == null ? '' : s).replace(/[^\w .'\-]/g, '').slice(0, n);
const code5 = () => Math.random().toString(36).slice(2, 7);
const topicOk = (t) => typeof t === 'string' && /^[a-z][a-z0-9_.-]{0,31}$/.test(t);
const small = (o, max) => { try { return JSON.stringify(o).length <= max; } catch (e) { return false; } };

function snapshot(r) {
  return { list: [...r.peers.values()].map((q) => ({ id: q.id, p: q.p })), host: r.host };
}

function leave(sock) {
  const code = sock.data.room;
  if (!code) return;
  sock.leave(code);
  sock.data.room = null;
  const r = rooms.get(code);
  if (!r) return;
  r.peers.delete(sock.id);
  if (!r.peers.size) { rooms.delete(code); return; }
  if (r.host === sock.id) r.host = r.peers.keys().next().value; // host migration
  io.to(code).emit('peers', snapshot(r));
}

function enter(sock, r, ack) {
  leave(sock);
  r.peers.set(sock.id, { id: sock.id, p: {} });
  sock.join(r.code);
  sock.data.room = r.code;
  const snap = snapshot(r);
  ack({ ok: 1, code: r.code, host: r.host === sock.id, hostId: r.host, peers: snap.list });
  sock.to(r.code).emit('peers', snap);
}

io.on('connection', (sock) => {
  sock.data.room = null;
  let tokens = 80, last = Date.now();
  const allow = () => { // token bucket: ~60 msgs/s, burst 80
    const now = Date.now();
    tokens = Math.min(80, tokens + ((now - last) / 1000) * 60);
    last = now;
    return tokens-- >= 1;
  };

  sock.on('list', (ack) => {
    if (typeof ack !== 'function') return;
    ack([...rooms.values()].map((r) => ({ code: r.code, title: r.title, n: r.peers.size, max: r.max, m: r.m })).slice(0, 50));
  });

  sock.on('create', (o, ack) => {
    if (typeof ack !== 'function') return;
    o = o || {};
    if (rooms.size >= MAX_ROOMS) return ack({ err: 'busy' });
    let code = clean(o.code, 10).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!code) { do code = code5(); while (rooms.has(code)); }
    if (rooms.has(code)) return ack({ err: 'taken' });
    const r = { code, title: clean(o.title, 28) || 'Server', max: Math.max(2, Math.min(16, +o.max || 8)), host: sock.id, m: 'sandbox', peers: new Map() };
    rooms.set(code, r);
    enter(sock, r, ack);
  });

  sock.on('join', (o, ack) => {
    if (typeof ack !== 'function') return;
    const code = clean(o && o.code, 10).toLowerCase().replace(/[^a-z0-9]/g, '');
    const r = rooms.get(code);
    if (!r) return ack({ err: 'nofound' });
    if (r.peers.size >= r.max && !r.peers.has(sock.id)) return ack({ err: 'full' });
    enter(sock, r, ack);
  });

  sock.on('pr', (patch) => { // presence patch
    const r = rooms.get(sock.data.room);
    if (!r || !patch || typeof patch !== 'object' || !allow() || !small(patch, 1500)) return;
    const keys = Object.keys(patch);
    if (keys.length > 24) return;
    const q = r.peers.get(sock.id);
    const out = {};
    for (const k of keys) {
      if (!/^[a-z][a-z0-9_]{0,15}$/.test(k)) continue;
      const v = patch[k];
      if (v === null) { delete q.p[k]; out[k] = null; }
      else if (typeof v === 'number' && isFinite(v)) { q.p[k] = v; out[k] = v; }
      else if (typeof v === 'string') { q.p[k] = v.slice(0, 40); out[k] = q.p[k]; }
    }
    sock.to(r.code).emit('pr', { id: sock.id, p: out });
  });

  sock.on('ev', (m) => { // relay a game event to everyone else in the room
    const r = rooms.get(sock.data.room);
    if (!r || !m || !topicOk(m.t) || !allow() || !small(m.d === undefined ? null : m.d, 4096)) return;
    if (m.t === 'state' && r.host === sock.id && m.d && typeof m.d.m === 'string') r.m = clean(m.d.m, 12);
    sock.to(r.code).emit('ev', { id: sock.id, t: m.t, d: m.d });
  });

  sock.on('leave', () => leave(sock));
  sock.on('disconnect', () => leave(sock));
});

srv.listen(PORT, () => console.log('BLOCKBOX server listening on ' + PORT));
