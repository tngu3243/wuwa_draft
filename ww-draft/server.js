// Wuthering Waves Round 2 draft server. Authoritative state, rooms, WebSocket sync.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { WebSocketServer } = require('ws');
const PORT = +process.env.PORT || 3000;

const ROSTER = ["Rover (Spectro)", "Rover (Havoc)", "Rover (Aero)", "Rover (Electro)", "Jiyan", "Calcharo", "Encore", "Jianxin", "Lingyang", "Verina", "Yinlin", "Jinhsi", "Changli", "Zhezhi", "Xiangli Yao", "Shorekeeper", "Camellya", "Carlotta", "Roccia", "Phoebe", "Brant", "Cantarella", "Zani", "Ciaccona", "Cartethyia", "Lupa", "Phrolova", "Augusta", "Iuno", "Galbrena", "Qiuyuan", "Chisa", "Lynae", "Mornye", "Aemeath", "Luuk Herssen", "Sigrika", "Hiyuki", "Denia", "Lucy", "Rebecca", "Lucilla", "Yangyang: Xuanling", "Suisui", "Qingxiao", "Jingran", "Hsin", "Suoming", "Aalto", "Baizhi", "Chixia", "Danjin", "Mortefi", "Sanhua", "Taoqi", "Yangyang", "Yuanwu", "Youhu", "Lumi", "Buling"];
const BOSSES = ["Tempest Mephis", "Thundering Mephis", "Impermanence Heron", "Mourning Aix", "Feilian Beringal", "Crownless", "Inferno Rider", "Fallacy of No Return", "Sentry Construct", "Hecate", "Dragon of Dirge", "Fleurdelys", "Lorelei", "Nightmare: Kelpie", "Lady of the Sea", "Lioness of Glory", "The False Sovereign", "Dreamless", "Reactor Husk", "Hyvatia", "Sigillum", "Nameless Explorer", "Denia", "Myriad Snare: Rustfire Chassis"];
const SEEDS = ["#1 vs #8", "#4 vs #5", "#2 vs #7", "#3 vs #6"];
const BAN = "ABBAAB", PICK = "BAABBAABBAABBAABBA", TEAMBAN = "AABB";
const STEPS = [...BAN].map(p => ({ p, t: "ban" }))
  .concat([...PICK].map(p => ({ p, t: "pick" })), [...TEAMBAN].map(p => ({ p, t: "tban" })));
const other = s => (s === "A" ? "B" : "A");
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clean = (s, n = 24) => String(s ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, n);

const rooms = new Map();
function newCode() { let c; do { c = Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[01OI]/g, "X"); } while (rooms.has(c)); return c; }
function newRoom(hostId) {
  return { code: newCode(), hostId, clients: new Map(), slots: { p1: null, p2: null }, phase: "lobby", seed: 0,
    bosses: shuffle(BOSSES).slice(0, 5), extra: [], sideOf: null, hist: [], touched: Date.now(), ...blank() };
}
function blank() { return { i: 0, ban: [], pick: { A: [], B: [] }, tban: { A: [], B: [] }, t: Array.from({ length: 5 }, () => ({ A: "", B: "" })) }; }
const roster = r => ROSTER.concat(r.extra);
function avail(r) {
  const st = STEPS[r.i]; if (r.phase !== "draft" || !st) return [];
  if (st.t === "ban") return roster(r).filter(c => !r.ban.includes(c));
  if (st.t === "pick") return roster(r).filter(c => !r.ban.includes(c) && !r.pick.A.includes(c) && !r.pick.B.includes(c));
  return r.pick[other(st.p)].filter(c => !r.tban[st.p].includes(c));
}
function snap(r) { r.hist.push(JSON.stringify({ phase: r.phase, i: r.i, ban: r.ban, pick: r.pick, tban: r.tban })); }
function parseT(s) {
  s = String(s).trim().toLowerCase(); if (!s) return null;
  if (/^(x|f|fail|dnf)$/.test(s)) return Infinity;
  const m = s.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/); return m ? (+(m[1] || 0)) * 60 + parseFloat(m[2]) : null;
}
function gameResult(g) {
  const a = parseT(g.A), b = parseT(g.B); if (a === null || b === null) return null;
  if (a === Infinity && b === Infinity) return "void"; if (a === b) return null; return a < b ? "A" : "B";
}
function matchState(r) {
  const w = { A: 0, B: 0 }; let over = null;
  r.t.forEach(g => { if (over) return; const x = gameResult(g); if (x === "A" || x === "B") { w[x]++; if (w[x] === 3) over = x; } });
  return { w, over };
}

function view(r, id) {
  const c = r.clients.get(id), isHost = id === r.hostId;
  const slotOf = s => (r.sideOf ? r.sideOf[s] : null);
  const step = STEPS[r.i];
  const mySide = r.sideOf && c ? (r.sideOf.A === c.role ? "A" : r.sideOf.B === c.role ? "B" : null) : null;
  const actorSlot = r.phase === "draft" && step ? slotOf(step.p) : null;
  const canAct = !!actorSlot && (c.role === actorSlot || (isHost && c.role === "spec"));
  const pl = s => { const x = r.slots[s] && r.clients.get(r.slots[s]); return x ? { name: x.name, on: x.on } : null; };
  const names = r.sideOf ? { A: pl(r.sideOf.A)?.name || "A", B: pl(r.sideOf.B)?.name || "B" } : null;
  const { w, over } = matchState(r);
  return { code: r.code, phase: r.phase, seed: r.seed, seeds: SEEDS, bosses: r.bosses, steps: STEPS, i: r.i,
    ban: r.ban, pick: r.pick, tban: r.tban, t: r.t, results: r.t.map(gameResult), wins: w, winner: over,
    names, players: { p1: pl("p1"), p2: pl("p2") }, spectators: [...r.clients.values()].filter(x => x.role === "spec" && x.on).length,
    avail: canAct ? avail(r) : [], canAct, you: { role: c.role, isHost, side: mySide, name: c.name }, lan: lanUrls() };
}
function broadcast(r) { r.touched = Date.now(); for (const [id, c] of r.clients) if (c.on && c.ws.readyState === 1) c.ws.send(JSON.stringify({ type: "state", state: view(r, id) })); }

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === "IPv4" && !n.internal) out.push(`http://${n.address}:${PORT}`);
  return out;
}

function handle(ws, ctx, m) {
  const err = (code, msg) => ws.send(JSON.stringify({ type: "error", code, msg }));
  if (m.type === "join") {
    const id = clean(m.id, 40); if (!id) return err("bad", "Missing client id.");
    let r = m.room ? rooms.get(clean(m.room, 8).toUpperCase()) : null;
    if (!m.room) { r = newRoom(id); rooms.set(r.code, r); }
    if (!r) return err("no_room", "Room not found. Check the code.");
    let c = r.clients.get(id);
    if (!c) {
      let role = "spec";
      if (m.role === "player") role = !r.slots.p1 ? "p1" : !r.slots.p2 ? "p2" : "spec";
      if (m.role === "player" && role === "spec") err("full", "Both player slots are taken. You joined as a spectator.");
      if (role !== "spec" && r.phase !== "lobby") role = "spec";
      c = { name: clean(m.name) || (role === "spec" ? "Spectator" : "Player"), role, on: true, ws };
      r.clients.set(id, c); if (role !== "spec") r.slots[role] = id;
    } else { c.ws = ws; c.on = true; if (m.name) c.name = clean(m.name) || c.name; }
    ctx.room = r; ctx.id = id; return broadcast(r);
  }
  const r = ctx.room; if (!r) return err("no_room", "Join a room first.");
  const id = ctx.id, host = id === r.hostId, c = r.clients.get(id);
  const side = c && r.sideOf ? (r.sideOf.A === c.role ? "A" : r.sideOf.B === c.role ? "B" : null) : null;
  const hostOnly = () => { if (!host) { err("denied", "Only the room host can do that."); return false; } return true; };

  switch (m.type) {
    case "seed": if (!hostOnly() || r.phase !== "lobby") return; r.seed = Math.max(0, Math.min(3, +m.v | 0)); break;
    case "reroll": if (!hostOnly() || r.phase !== "lobby") return; r.bosses = shuffle(BOSSES).slice(0, 5); break;
    case "start":
      if (!hostOnly() || r.phase !== "lobby") return;
      if (!r.slots.p1 || !r.slots.p2) return err("need_players", "Two players must join before the draw.");
      r.sideOf = Math.random() < 0.5 ? { A: "p1", B: "p2" } : { A: "p2", B: "p1" };
      Object.assign(r, blank()); r.hist = []; r.phase = "draft"; break;
    case "act": {
      const st = STEPS[r.i]; if (r.phase !== "draft" || !st) return;
      const actorSlot = r.sideOf[st.p];
      if (!(c.role === actorSlot || (host && c.role === "spec"))) return err("not_turn", "It isn’t your turn.");
      const ch = clean(m.c, 40); if (!avail(r).includes(ch)) return err("bad_pick", "That character isn’t available.");
      snap(r);
      if (st.t === "ban") r.ban.push(ch); else if (st.t === "pick") r.pick[st.p].push(ch); else r.tban[st.p].push(ch);
      r.i++; if (r.i >= STEPS.length) r.phase = "match"; break;
    }
    case "addChar": {
      if (!(host || c.role !== "spec") || r.phase !== "draft" || !["ban", "pick"].includes(STEPS[r.i]?.t)) return;
      const n = clean(m.name, 30); if (n && !roster(r).some(x => x.toLowerCase() === n.toLowerCase())) r.extra.push(n); break;
    }
    case "undo": {
      if (!hostOnly() || !r.hist.length) return;
      const s = JSON.parse(r.hist.pop()); Object.assign(r, s); break;
    }
    case "reset": if (!hostOnly()) return; Object.assign(r, blank()); r.phase = "lobby"; r.sideOf = null; r.hist = []; r.extra = []; r.bosses = shuffle(BOSSES).slice(0, 5); break;
    case "time": {
      if (r.phase !== "match") return; const g = +m.g, s = m.side;
      if (!(g >= 0 && g < 5) || (s !== "A" && s !== "B")) return;
      if (!(host || side === s)) return err("denied", "You can only enter your own time.");
      r.t[g][s] = clean(m.v, 12); break;
    }
    case "replaceBoss": {
      if (!hostOnly() || r.phase !== "match") return; const k = +m.g;
      if (!(k >= 0 && k < 5) || gameResult(r.t[k]) !== "void") return;
      const rest = BOSSES.filter(b => !r.bosses.includes(b)); r.bosses[k] = shuffle(rest)[0]; r.t[k] = { A: "", B: "" }; break;
    }
    default: return;
  }
  broadcast(r);
}

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) {
    fs.readFile(path.join(__dirname, "public", "index.html"), (e, d) => {
      if (e) { res.writeHead(500); return res.end("index.html missing"); }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(d);
    });
  } else { res.writeHead(404); res.end("Not found"); }
});
const wss = new WebSocketServer({ server, maxPayload: 4096 });
wss.on("connection", ws => {
  const ctx = { room: null, id: null }; ws.alive = true; ws.on("pong", () => (ws.alive = true));
  ws.on("message", raw => { let m; try { m = JSON.parse(raw); } catch { return; } if (m && typeof m === "object") { try { handle(ws, ctx, m); } catch (e) { console.error(e); } } });
  ws.on("close", () => { const c = ctx.room?.clients.get(ctx.id); if (c && c.ws === ws) { c.on = false; broadcast(ctx.room); } });
});
setInterval(() => { wss.clients.forEach(ws => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); }); }, 20000);
setInterval(() => { for (const [k, r] of rooms) if (Date.now() - r.touched > 6 * 3600e3) rooms.delete(k); }, 600e3);

if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`\nDraft server running.\n  This machine:  http://localhost:${PORT}`);
    lanUrls().forEach(u => console.log(`  Other devices: ${u}`)); console.log("");
  });
}
module.exports = { server, STEPS };
