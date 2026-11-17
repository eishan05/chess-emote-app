# Checkmoji

Chess in the browser with Clash-Royale-style emotes. Play a bot that trash-talks back, or send a friend a link and play online.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 (also on your LAN)
```

`npm run dev` runs everything, including the online-room WebSocket server (it's a Vite plugin).

Production:

```bash
npm run build
npm start            # serves dist/ + WebSockets on http://localhost:3000 (PORT to change)
```

To play a friend who isn't on your Wi-Fi, deploy `npm run build && npm start` to any Node host that supports WebSockets (Render, Fly.io, Railway, a VPS…).

## Features

- **Emotes**: 8 animated characters (the chess pieces themselves: laughing knight, crying king, angry rook, shocked queen, thinking bishop, cool pawn, sleepy king, thumbs-up pawn) plus 6 quick-chat phrases. They pop out of the player's banner in a speech bubble with a synthesized voice. Press `1`–`8` as shortcuts. Spamming triggers a cooldown, and you can mute your opponent.
- **Bots**: Pawnderer (easy), Knightmare (medium), Checkmatey (hard). Each bot reacts with emotes to captures, blunders, checks, idling, the result and your own emotes. Spam them and they mute you.
- **Online**: create a room, share the code or link. The server validates every move, rate-limits emotes, keeps your seat across refreshes, and supports draw offers, resign, rematch (colours swap) and spectators.
- Drag-and-drop or click-to-move, legal-move hints, promotion picker, captured pieces, move list, and a mobile layout.

## Layout

| Path | What |
| --- | --- |
| `src/emotes.ts` | Emote definitions and SVG art (animations live in `style.css`) |
| `src/ui/emoteUI.ts` | Emote picker, bubbles, cooldown |
| `src/botBrain.ts` | Bot personalities and emote reactions |
| `src/engine/search.ts` | Alpha-beta engine (runs in a Web Worker) |
| `src/board.ts` | Board rendering and input |
| `src/game.ts` | `BotGame` and `OnlineGame` controllers |
| `server/rooms.js` | WebSocket room server (protocol documented at the top) |
| `src/sound.ts` | All sounds, synthesized with WebAudio (no audio files) |

Note: the engine uses chess.js internals for speed, so `chess.js` is pinned to an exact version. If you upgrade it, check that `findBestMove` still uses the fast path.

Rooms live in memory, so restarting the server ends games in progress.
