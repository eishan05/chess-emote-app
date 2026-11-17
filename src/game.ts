import { Chess, type Move, type Square } from 'chess.js';
import type { LastMove } from './board';
import type { PieceType, Side } from './pieces';
import type { Level, SearchResult } from './engine/search';
import { BotBrain, type Persona } from './botBrain';

export interface PlayerInfo {
  name: string;
  avatar: PieceType;
  connected: boolean;
  isBot?: boolean;
  thinking?: boolean;
}

export interface GameResult {
  winner: Side | null;
  reason: string;
}

export type Status = 'connecting' | 'waiting' | 'playing' | 'over' | 'error';
export type NoticeKind = 'draw-offer' | 'draw-declined' | 'rematch-offer' | 'muted' | 'info' | 'error';

export interface ChangeInfo {
  /** The move that was just played, if any (used for sounds). */
  moved?: Move;
  /** True when the game restarted (rematch). */
  newGame?: boolean;
}

export interface GameEvents {
  change(info: ChangeInfo): void;
  emote(side: Side, id: string): void;
  notice(kind: NoticeKind, text: string): void;
}

const noopEvents: GameEvents = { change() {}, emote() {}, notice() {} };

export abstract class GameController {
  chess = new Chess();
  mySide: Side | null = 'w';
  players: Record<Side, PlayerInfo | null> = { w: null, b: null };
  status: Status = 'playing';
  result: GameResult | null = null;
  lastMove: LastMove | null = null;
  drawOffer: Side | null = null;
  rematchOffers: Side[] = [];
  roomCode: string | null = null;
  events: GameEvents = noopEvents;
  abstract readonly mode: 'bot' | 'online';

  abstract move(from: Square, to: Square, promotion?: PieceType): void;
  /** Send an emote (the UI shows your own emote immediately). */
  abstract emote(id: string): void;
  abstract resign(): void;
  abstract offerDraw(): void;
  abstract answerDraw(accept: boolean): void;
  abstract rematch(): void;
  abstract destroy(): void;

  get opponentSide(): Side {
    return this.mySide === 'b' ? 'w' : 'b';
  }

  isMyTurn() {
    return this.status === 'playing' && this.mySide === this.chess.turn();
  }
}

function resultFor(chess: Chess): GameResult | null {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) return { winner: chess.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
  if (chess.isStalemate()) return { winner: null, reason: 'stalemate' };
  if (chess.isThreefoldRepetition()) return { winner: null, reason: 'repetition' };
  if (chess.isInsufficientMaterial()) return { winner: null, reason: 'insufficient material' };
  return { winner: null, reason: '50-move rule' };
}

// ---------------------------------------------------------------------------
// Bot game
// ---------------------------------------------------------------------------

interface WorkerReply {
  id: number;
  result: SearchResult | null;
  error?: string;
}

export class BotGame extends GameController {
  readonly mode = 'bot';
  private worker: Worker;
  private requestId = 0;
  private brain: BotBrain;
  private lastEval: number | null = null;
  private idleTimer = 0;
  private botSide: Side;

  constructor(
    readonly persona: Persona,
    private myName: string,
    mySide: Side,
  ) {
    super();
    this.mySide = mySide;
    this.botSide = mySide === 'w' ? 'b' : 'w';
    this.worker = new Worker(new URL('./engine/bot.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerReply>) => this.onBotReply(e.data);
    this.brain = new BotBrain(persona, (id) => this.events.emote(this.botSide, id));
    this.setPlayers();
  }

  private setPlayers() {
    this.players[this.mySide!] = { name: this.myName, avatar: 'k', connected: true };
    this.players[this.botSide] = { name: this.persona.name, avatar: this.persona.avatar, connected: true, isBot: true };
  }

  start() {
    this.status = 'playing';
    this.brain.onStart();
    this.afterMove();
  }

  move(from: Square, to: Square, promotion?: PieceType) {
    if (!this.isMyTurn()) return;
    let m: Move;
    try {
      m = this.chess.move({ from, to, promotion });
    } catch {
      return;
    }
    this.lastMove = { from: m.from, to: m.to };
    clearTimeout(this.idleTimer);
    if (m.captured) this.brain.onPlayerCaptured(m.captured as PieceType);
    this.events.change({ moved: m });
    this.afterMove();
  }

  private afterMove() {
    const res = resultFor(this.chess);
    if (res) return this.finish(res);
    if (this.chess.turn() === this.botSide) this.think();
    else this.idleTimer = window.setTimeout(() => this.brain.onPlayerIdle(), 25_000);
  }

  private think() {
    const id = ++this.requestId;
    this.players[this.botSide]!.thinking = true;
    this.events.change({});
    const started = performance.now();
    this.pendingMinDelay = started + 450 + Math.random() * 500;
    this.worker.postMessage({ id, history: this.chess.history(), level: this.persona.level as Level });
  }
  private pendingMinDelay = 0;

  private onBotReply({ id, result }: WorkerReply) {
    if (id !== this.requestId || this.status !== 'playing') return;
    const wait = Math.max(0, this.pendingMinDelay - performance.now());
    setTimeout(() => {
      if (id !== this.requestId || this.status !== 'playing') return;
      this.players[this.botSide]!.thinking = false;
      if (!result) return;
      // How did the player's last move change things? (positive = good for bot)
      if (this.lastEval !== null && result.depth > 1) this.brain.onEvalSwing(result.score - this.lastEval);
      this.lastEval = result.depth > 1 ? result.score : null;
      let m: Move;
      try {
        m = this.chess.move({ from: result.from, to: result.to, promotion: result.promotion });
      } catch {
        const moves = this.chess.moves({ verbose: true });
        m = this.chess.move(moves[Math.floor(Math.random() * moves.length)]);
      }
      this.lastMove = { from: m.from, to: m.to };
      this.brain.onBotMoved(m.captured as PieceType | undefined, this.chess.inCheck() && !this.chess.isCheckmate());
      this.events.change({ moved: m });
      this.afterMove();
    }, wait);
  }

  private finish(res: GameResult) {
    clearTimeout(this.idleTimer);
    this.status = 'over';
    this.result = res;
    this.players[this.botSide]!.thinking = false;
    this.brain.onGameOver(res.winner === null ? null : res.winner === this.botSide);
    this.events.change({});
  }

  emote(id: string) {
    const muted = this.brain.onPlayerEmote(id);
    if (muted) this.events.notice('muted', `${this.persona.name} muted your emotes 🙉`);
  }

  resign() {
    if (this.status !== 'playing') return;
    this.requestId++;
    this.finish({ winner: this.botSide, reason: 'resignation' });
  }

  offerDraw() {
    if (this.status !== 'playing') return;
    this.events.notice('info', `You offered a draw to ${this.persona.name}…`);
    setTimeout(() => {
      if (this.status !== 'playing') return;
      const evalNow = this.lastEval ?? 0;
      const accept = evalNow < -150 || (this.chess.history().length > 60 && Math.abs(evalNow) < 40);
      if (accept) {
        this.requestId++;
        this.events.notice('info', `${this.persona.name} accepted the draw.`);
        this.finish({ winner: null, reason: 'agreement' });
      } else {
        this.events.notice('draw-declined', `${this.persona.name} declined the draw.`);
        this.brain.onDrawDeclined();
      }
    }, 1200);
  }

  answerDraw() {}

  rematch() {
    this.requestId++;
    clearTimeout(this.idleTimer);
    this.brain.reset();
    this.mySide = this.botSide;
    this.botSide = this.mySide === 'w' ? 'b' : 'w';
    this.chess = new Chess();
    this.lastMove = null;
    this.result = null;
    this.lastEval = null;
    this.players = { w: null, b: null };
    this.setPlayers();
    this.events.change({ newGame: true });
    this.start();
  }

  destroy() {
    this.requestId++;
    clearTimeout(this.idleTimer);
    this.brain.reset();
    this.worker.terminate();
    this.events = noopEvents;
  }
}

// ---------------------------------------------------------------------------
// Online game
// ---------------------------------------------------------------------------

interface ServerState {
  t: 'state';
  code: string;
  game: number;
  you: Side | null;
  moves: string[];
  lastMove: LastMove | null;
  players: Record<Side, { name: string; connected: boolean } | null>;
  status: 'waiting' | 'playing' | 'over';
  result: GameResult | null;
  drawOffer: Side | null;
  rematch: Side[];
}

type ServerMsg =
  | ServerState
  | { t: 'emote'; side: Side; id: string }
  | { t: 'notice'; kind: 'draw-offer' | 'draw-declined' | 'rematch-offer'; side: Side }
  | { t: 'error'; message: string };

function sessionToken(): string {
  const key = 'checkmoji.token';
  try {
    let t = sessionStorage.getItem(key);
    if (!t) {
      t = crypto.randomUUID().replace(/-/g, '');
      sessionStorage.setItem(key, t);
    }
    return t;
  } catch {
    return crypto.randomUUID().replace(/-/g, '');
  }
}

export class OnlineGame extends GameController {
  readonly mode = 'online';
  private ws: WebSocket | null = null;
  private closed = false;
  private retries = 0;
  private gameNo = 0;
  private everJoined = false;
  private token = sessionToken();

  constructor(
    private myName: string,
    private intent: { create: Side | 'random' } | { join: string },
  ) {
    super();
    this.status = 'connecting';
    this.mySide = 'create' in intent && intent.create !== 'random' ? intent.create : 'w';
    if ('join' in intent) this.roomCode = intent.join.toUpperCase();
    this.connect();
  }

  private connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      if (this.roomCode) this.send({ t: 'join', code: this.roomCode, name: this.myName, token: this.token });
      else if ('create' in this.intent) this.send({ t: 'create', name: this.myName, token: this.token, color: this.intent.create });
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onclose = () => {
      if (this.closed || this.ws !== ws) return;
      if (this.status !== 'error') {
        if (this.everJoined) this.events.notice('info', 'Connection lost. Reconnecting…');
        const delay = Math.min(8000, 500 * 2 ** this.retries++);
        setTimeout(() => !this.closed && this.connect(), delay);
      }
    };
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private handle(msg: ServerMsg) {
    switch (msg.t) {
      case 'state':
        return this.applyState(msg);
      case 'emote':
        return this.events.emote(msg.side, msg.id);
      case 'notice': {
        const who = this.players[msg.side]?.name ?? 'Opponent';
        if (msg.kind === 'draw-offer') this.events.notice('draw-offer', `${who} offers a draw`);
        if (msg.kind === 'draw-declined') this.events.notice('draw-declined', `${who} declined the draw`);
        if (msg.kind === 'rematch-offer') this.events.notice('rematch-offer', `${who} wants a rematch!`);
        return;
      }
      case 'error':
        if (!this.everJoined) {
          this.status = 'error';
          this.closed = true;
          this.ws?.close();
        }
        this.events.notice('error', msg.message);
        this.events.change({});
        return;
    }
  }

  private applyState(s: ServerState) {
    this.everJoined = true;
    const newGame = s.game !== this.gameNo && this.gameNo !== 0;
    if (s.game !== this.gameNo) {
      this.gameNo = s.game;
      this.chess = new Chess();
    }
    if (this.roomCode !== s.code) {
      this.roomCode = s.code;
      const url = new URL(location.href);
      url.searchParams.set('room', s.code);
      history.replaceState(null, '', url);
    }
    this.mySide = s.you;

    // Sync moves: apply only what's new, or rebuild if we diverged (e.g. a rejected optimistic move).
    const local = this.chess.history();
    const prefixOk = local.length <= s.moves.length && local.every((san, i) => san === s.moves[i]);
    let moved: Move | undefined;
    if (!prefixOk) {
      this.chess = new Chess();
      for (const san of s.moves) this.chess.move(san);
    } else {
      for (const san of s.moves.slice(local.length)) moved = this.chess.move(san);
    }

    this.lastMove = s.lastMove;
    for (const side of ['w', 'b'] as const) {
      const p = s.players[side];
      this.players[side] = p ? { name: p.name, avatar: side === 'w' ? 'k' : 'q', connected: p.connected } : null;
    }
    this.status = s.status;
    this.result = s.result;
    this.drawOffer = s.drawOffer;
    this.rematchOffers = s.rematch;
    this.events.change({ moved, newGame });
  }

  move(from: Square, to: Square, promotion?: PieceType) {
    if (!this.isMyTurn()) return;
    let m: Move;
    try {
      m = this.chess.move({ from, to, promotion });
    } catch {
      return;
    }
    // Optimistic: show the move now; the server's state will confirm or roll back.
    this.lastMove = { from: m.from, to: m.to };
    this.events.change({ moved: m });
    this.send({ t: 'move', from, to, promotion });
  }

  emote(id: string) {
    this.send({ t: 'emote', id });
  }
  resign() {
    this.send({ t: 'resign' });
  }
  offerDraw() {
    this.send({ t: 'draw', action: 'offer' });
    this.events.notice('info', 'Draw offered');
  }
  answerDraw(accept: boolean) {
    this.send({ t: 'draw', action: accept ? 'accept' : 'decline' });
  }
  rematch() {
    this.send({ t: 'rematch' });
  }
  destroy() {
    this.closed = true;
    this.ws?.close();
    this.events = noopEvents;
  }
}
