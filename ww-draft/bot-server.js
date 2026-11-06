// Serve the existing multiplayer UI alongside the preliminary solo-vs-bot UI.
// The original WebSocket game server remains authoritative for all draft actions.
const fs = require('fs');
const path = require('path');
const { server } = require('./server');

// Replace the original static handler so the classic UI remains available at /multiplayer.
server.removeAllListeners('request');
server.on('request', (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = pathname === '/' || pathname === '/solo'
    ? path.join(__dirname, 'public', 'solo.html')
    : pathname === '/multiplayer'
      ? path.join(__dirname, 'public', 'index.html')
      : null;

  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  fs.readFile(file, (error, contents) => {
    if (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Could not load the draft page.');
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(contents);
  });
});

if (require.main === module) {
  const port = +process.env.PORT || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`\nDraft server running.\n  Play vs bot: http://localhost:${port}\n  Multiplayer: http://localhost:${port}/multiplayer\n`);
  });
}
module.exports = { server };
