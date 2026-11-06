# WuWa Round 2 Draft (LAN)

Real-time 1v1 BO5 draft for two players on separate devices, plus spectators.

## Run
Requires Node 18+.

    npm install
    npm start

The terminal prints a `localhost` address and one or more LAN addresses (for example `http://192.168.1.20:3000`).

## Play
1. Host opens the address, enters a name, picks Player, and clicks Create room.
2. The other player opens the host's LAN address on their device, enters the 4-letter room code, and joins as Player.
3. Anyone else can join as Spectator / referee.
4. Host picks the seed matchup, rerolls bosses if wanted, then clicks Draw A / B.
5. The app runs the ban, pick and team-ban phases in the exact snake order. Only the player whose turn it is sees the character list.
6. In the match table each player enters their own clear times. The host can edit both, undo steps, replace voided bosses, or return to the lobby.

## Notes
- The server holds the state. Refreshing or briefly losing Wi-Fi rejoins you to the same seat (stored per browser tab).
- Four simultaneous matches: each match is its own room. Run one server and create four rooms.
- If other devices can't connect, allow Node through the host's firewall for port 3000 (or set `PORT=4000 npm start`).
- Rooms live in memory and clear on server restart.
- Edit `ROSTER`, `BOSSES` and the ban/pick order constants at the top of `server.js`.
- `npm test` runs a smoke test that drafts a full match over WebSockets.
