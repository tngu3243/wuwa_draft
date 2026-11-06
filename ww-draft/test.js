// Smoke test: two players draft a full match over WebSockets.
const WebSocket = require('ws'); const { server, STEPS } = require('./server');
server.listen(0, async () => {
  const port = server.address().port, mk = () => new Promise(r => { const w = new WebSocket(`ws://localhost:${port}`); w.st = null; w.on('message', d => { const m = JSON.parse(d); if (m.type === 'state') w.st = m.state; else if (m.type==='error') console.log('  err:', m.msg); }); w.on('open', () => r(w)); });
  const wait = ms => new Promise(r => setTimeout(r, ms)), send = (w, o) => w.send(JSON.stringify(o));
  const h = await mk(), g = await mk(), s = await mk();
  send(h, { type: 'join', id: 'h', name: 'Host', role: 'player' }); await wait(80);
  const code = h.st.code; send(g, { type: 'join', id: 'g', room: code, name: 'Guest', role: 'player' }); send(s, { type: 'join', id: 's', room: code, name: 'Ref', role: 'spectator' }); await wait(80);
  send(h, { type: 'start' }); await wait(80);
  const by = { p1: h, p2: g }; let n = 0;
  while (h.st.phase === 'draft') { const slot = h.st.steps[h.st.i], w = [h, g].find(x => x.st.canAct); send(w, { type: 'act', c: w.st.avail[0] }); await wait(15); n++; }
  console.log('steps played:', n, 'phase:', h.st.phase, 'pools:', h.st.pick.A.length, h.st.pick.B.length, 'bans:', h.st.ban.length, h.st.tban.A.length, h.st.tban.B.length);
  const sideH = h.st.you.side, sideG = g.st.you.side;
  [0, 1, 2].forEach(i => { send(h, { type: 'time', g: i, side: sideH, v: '1:00' }); send(g, { type: 'time', g: i, side: sideG, v: '1:10' }); });
  send(h, { type: 'time', g: 3, side: sideG, v: '1' }); await wait(100);
  console.log('winner side:', h.st.winner, 'host side:', sideH, 'spectator sees names:', JSON.stringify(s.st.names));
  send(g, { type: 'act', c: 'x' }); await wait(50);
  process.exit(0);
});
