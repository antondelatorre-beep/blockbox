# BLOCKBOX — Render deployment

Blocky ragdoll sandbox (Three.js) with multiplayer, **Prop Hunt**, **Zombie Survival** and sandbox mode.
Node + Express + Socket.IO. The server hosts rooms ("servers"), relays player state/events and migrates
the host if the host leaves. Game simulation (zombie waves, round logic) runs in the host's browser.

## Deploy on Render
1. Push this folder to a GitHub repo.
2. Render dashboard → **New → Web Service** → pick the repo.
   - Runtime: **Node**, Build: `npm install`, Start: `npm start`, Health check path: `/health`
   - (or **New → Blueprint** and Render reads `render.yaml`)
3. Open the `.onrender.com` URL. Free instances sleep after idle time; the first load can take ~30 s.

Local test: `npm install && npm start` → http://localhost:3000

## Playing together
- Open **☰ Opts → Your name**, then **Host** (type a code or leave blank for a random 5-letter code) or **Join** with a friend's code.
- **Browse servers** lists open rooms; tap one to join. Max 8 players per room by default (change `max` in `server.js`).
- Only the host can press **Start** for a mode. Prop Hunt splits players into hunters and props automatically.
- Everyone sees each other, can shoot each other (sandbox), and score shows as kills/deaths on the left.

## Modes
- **Sandbox**: everything unlocked, spawnlist, tanks, flags (spawn flags from 📋 List → Flags), AI toggles, Freeze NPC AI.
- **Prop Hunt**: props hide as map props (DISGUISE button / G while aiming at a prop). Hunters are frozen for the first 12 s,
  shoot suspicious props and lose health for hitting real props. Solo: hunt 6 hidden NPC props in 150 s.
- **Zombie Survival**: waves of zombies, earn cash per kill and per wave, buy weapons/props/health in 🛒 Shop,
  place crates/planks/barrels as barricades — zombies chew through props that block them.

## Files
- `server.js` — Express + Socket.IO room server (rate limited, size limited, host migration)
- `index.html` — the whole game client
- `render.yaml` — optional Render Blueprint
