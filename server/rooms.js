/**
 * Online rooms over WebSocket. The server is authoritative: it validates every
 * move with chess.js and relays emotes (rate limited) to the other player.
 *
 * Protocol (JSON):
 *   client -> server
 *     { t: 'create', name, token, color: 'w'|'b'|'random' }
 *     { t: 'join', code, name, token }
 *     { t: 'move', from, to, promotion? }
 *     { t: 'emote', id }
 *     { t: 'resign' }
 *     { t: 'draw', action: 'offer'|'accept'|'decline' }
 *     { t: 'rematch' }
 *   server -> client
 *     { t: 'state', ...snapshot }   full room snapshot after every change
 *     { t: 'emote', side, id }
 *     { t: 'notice', kind, side }   draw offered/declined, rematch offered
 *     { t: 'error', message }
 */
import { WebSocketServer } from 'ws';
import { Chess } from 'chess.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 30 * 60 * 1000; // delete rooms nobody has touched for 30 minutes
const EMOTE_WINDOW_MS = 10_000;
const EMOTE_MAX_PER_WINDOW = 5;

/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * @typedef {{ token: string, name: string, ws: import('ws').WebSocket | null, emotes: number[] }} Seat
 * @typedef {{
 *   code: string, chess: Chess, seats: { w: Seat | null, b: Seat | null },
 *   spectators: Set<import('ws').WebSocket>, status: 'waiting'|'playing'|'over',
 *   result: { winner: 'w'|'b'|null, reason: string } | null,
 *   drawOffer: 'w'|'b'|null, rematch: Set<string>, lastMove: { from: string, to: string } | null,
 *   touched: number, game: number
 * }} Room
 */

function newCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const cleanName = (n) => String(n ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Player';
const cleanToken = (t) => (typeof t === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : null);

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function sideOf(room, ws) {
  if (room.seats.w?.ws === ws) return 'w';
  if (room.seats.b?.ws === ws) return 'b';
  return null;
}

function everyone(room) {
  const list = [...room.spectators];
  for (const s of ['w', 'b']) if (room.seats[s]?.ws) list.push(room.seats[s].ws);
  return list;
}

function snapshot(room, you) {
  const seat = (s) => (room.seats[s] ? { name: room.seats[s].name, connected: !!room.seats[s].ws } : null);
  return {
    t: 'state',
    code: room.code,
    game: room.game,
    you,
    moves: room.chess.history(),
    lastMove: room.lastMove,
    players: { w: seat('w'), b: seat('b') },
    status: room.status,
    result: room.result,
    drawOffer: room.drawOffer,
    rematch: [...room.rematch],
  };
}

function broadcastState(room) {
  room.touched = Date.now();
  for (const s of ['w', 'b']) if (room.seats[s]?.ws) send(room.seats[s].ws, snapshot(room, s));
  for (const ws of room.spectators) send(ws, snapshot(room, null));
}

function broadcast(room, msg, except) {
  for (const ws of everyone(room)) if (ws !== except) send(ws, msg);
}

function checkGameOver(room) {
  const c = room.chess;
  if (!c.isGameOver()) return;
  room.status = 'over';
  room.drawOffer = null;
  if (c.isCheckmate()) room.result = { winner: c.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
  else if (c.isStalemate()) room.result = { winner: null, reason: 'stalemate' };
  else if (c.isThreefoldRepetition()) room.result = { winner: null, reason: 'repetition' };
  else if (c.isInsufficientMaterial()) room.result = { winner: null, reason: 'insufficient material' };
  else room.result = { winner: null, reason: '50-move rule' };
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  room.spectators.delete(ws);
  const side = sideOf(room, ws);
  if (side) {
    room.seats[side].ws = null;
    broadcastState(room);
  }
}

function seatPlayer(room, side, ws, name, token) {
  const seat = room.seats[side];
  if (seat?.ws && seat.ws !== ws) {
    // Same player opened a second tab: the newest connection wins.
    send(seat.ws, { t: 'error', message: 'This game was opened in another tab.' });
    seat.ws.room = null;
    seat.ws.close();
  }
  room.seats[side] = { token, name, ws, emotes: seat?.emotes ?? [] };
  ws.room = room;
}

const handlers = {
  create(ws, msg) {
    const token = cleanToken(msg.token);
    if (!token) return send(ws, { t: 'error', message: 'Bad token' });
    leave(ws);
    const side = msg.color === 'w' || msg.color === 'b' ? msg.color : Math.random() < 0.5 ? 'w' : 'b';
    /** @type {Room} */
    const room = {
      code: newCode(),
      chess: new Chess(),
      seats: { w: null, b: null },
      spectators: new Set(),
      status: 'waiting',
      result: null,
      drawOffer: null,
      rematch: new Set(),
      lastMove: null,
      touched: Date.now(),
      game: 1,
    };
    rooms.set(room.code, room);
    seatPlayer(room, side, ws, cleanName(msg.name), token);
    broadcastState(room);
  },

  join(ws, msg) {
    const token = cleanToken(msg.token);
    const room = rooms.get(String(msg.code ?? '').toUpperCase());
    if (!token) return send(ws, { t: 'error', message: 'Bad token' });
    if (!room) return send(ws, { t: 'error', message: 'Game not found. Check the code or create a new game.' });
    leave(ws);
    const name = cleanName(msg.name);
    const mine = ['w', 'b'].find((s) => room.seats[s]?.token === token);
    if (mine) {
      seatPlayer(room, mine, ws, name, token);
    } else {
      const free = ['w', 'b'].find((s) => !room.seats[s]);
      if (free) {
        seatPlayer(room, free, ws, name, token);
        if (room.status === 'waiting') room.status = 'playing';
      } else {
        room.spectators.add(ws);
        ws.room = room;
      }
    }
    broadcastState(room);
  },

  move(ws, msg) {
    const room = ws.room;
    const side = room && sideOf(room, ws);
    if (!side || room.status !== 'playing') return;
    if (room.chess.turn() !== side) return send(ws, snapshot(room, side));
    try {
      const m = room.chess.move({ from: msg.from, to: msg.to, promotion: msg.promotion });
      room.lastMove = { from: m.from, to: m.to };
      room.drawOffer = null;
      checkGameOver(room);
    } catch {
      return send(ws, snapshot(room, side)); // illegal: resync the sender
    }
    broadcastState(room);
  },

  emote(ws, msg) {
    const room = ws.room;
    const side = room && sideOf(room, ws);
    if (!side || typeof msg.id !== 'string' || !/^[a-z]{1,12}$/.test(msg.id)) return;
    const seat = room.seats[side];
    const now = Date.now();
    seat.emotes = seat.emotes.filter((t) => now - t < EMOTE_WINDOW_MS);
    if (seat.emotes.length >= EMOTE_MAX_PER_WINDOW) return;
    seat.emotes.push(now);
    broadcast(room, { t: 'emote', side, id: msg.id }, ws);
  },

  resign(ws) {
    const room = ws.room;
    const side = room && sideOf(room, ws);
    if (!side || room.status !== 'playing') return;
    room.status = 'over';
    room.drawOffer = null;
    room.result = { winner: side === 'w' ? 'b' : 'w', reason: 'resignation' };
    broadcastState(room);
  },

  draw(ws, msg) {
    const room = ws.room;
    const side = room && sideOf(room, ws);
    if (!side || room.status !== 'playing') return;
    if (msg.action === 'offer' && !room.drawOffer) {
      room.drawOffer = side;
      broadcast(room, { t: 'notice', kind: 'draw-offer', side }, ws);
    } else if (msg.action === 'accept' && room.drawOffer && room.drawOffer !== side) {
      room.status = 'over';
      room.result = { winner: null, reason: 'agreement' };
      room.drawOffer = null;
    } else if (msg.action === 'decline' && room.drawOffer && room.drawOffer !== side) {
      room.drawOffer = null;
      broadcast(room, { t: 'notice', kind: 'draw-declined', side }, ws);
    }
    broadcastState(room);
  },

  rematch(ws) {
    const room = ws.room;
    const side = room && sideOf(room, ws);
    if (!side || room.status !== 'over') return;
    room.rematch.add(side);
    if (room.rematch.size === 2) {
      // Swap colours for the new game.
      const { w, b } = room.seats;
      room.seats = { w: b, b: w };
      room.chess = new Chess();
      room.status = 'playing';
      room.result = null;
      room.lastMove = null;
      room.drawOffer = null;
      room.rematch.clear();
      room.game += 1;
    } else {
      broadcast(room, { t: 'notice', kind: 'rematch-offer', side }, ws);
    }
    broadcastState(room);
  },
};

/**
 * Attach the room server to an existing Node HTTP server. Only upgrade
 * requests for `path` are handled, so other WebSocket users (e.g. Vite HMR)
 * keep working.
 */
export function attachRooms(httpServer, { path = '/ws' } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname !== path) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.room = null;
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      const handler = msg && typeof msg.t === 'string' && Object.hasOwn(handlers, msg.t) ? handlers[msg.t] : null;
      if (handler) handler(ws, msg);
    });
    ws.on('close', () => leave(ws));
  });

  // Heartbeat: drop dead sockets, and forget idle rooms.
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (everyone(room).length === 0 && now - room.touched > ROOM_TTL_MS) rooms.delete(code);
    }
  }, 30_000);
  timer.unref?.();
  httpServer.on('close', () => clearInterval(timer));

  return wss;
}
