// Serve a mode chooser, the solo-vs-bot draft, and the original multiplayer draft.
const fs = require('fs');
const path = require('path');
const { server } = require('./server');

// Keep the original WebSocket game server authoritative for all draft actions.
server.removeAllListeners('request');
server.on('request', (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const pages = {
    '/': 'home.html',
    '/solo': 'solo.html',
    '/multiplayer': 'index.html'
  };
  const file = pages[pathname] && path.join(__dirname, 'public', pages[pathname]);

  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  fs.readFile(file, (error, contents) => {
    if (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Could not load the draft page.');
    }

    // The solo page is missing its initial render call, which leaves #app empty.
    let html = contents.toString();
    if (pathname === '/solo') {
      html = html.replace(
        "connected=true;$('status').textContent='Connected';",
        "connected=true;$('status').textContent='Connected';render();"
      );
      html = html.replace(/\nconnect\(\);\n<\/script>/, '\nrender();\nconnect();\n</script>');
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  });
});

if (require.main === module) {
  const port = +process.env.PORT || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`\nDraft server running.\n  Choose a mode: http://localhost:${port}\n  Play vs bot: http://localhost:${port}/solo\n  Multiplayer: http://localhost:${port}/multiplayer\n`);
  });
}
module.exports = { server };
