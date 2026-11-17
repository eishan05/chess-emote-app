/**
 * Small alpha-beta chess engine for the bot opponent.
 *
 * It drives chess.js's internal move generator (`_moves` / `_makeMove` /
 * `_undoMove`), which is ~100x faster than the public verbose API. Those are
 * private APIs, so chess.js is pinned to an exact version in package.json.
 * If the internals ever disappear, `findBestMove` falls back to a shallow
 * search over the public API.
 */
import { Chess } from 'chess.js';

export type Level = 'easy' | 'medium' | 'hard';

export interface SearchResult {
  from: string;
  to: string;
  promotion?: string;
  /** Centipawns from the bot's point of view after its best reply line. */
  score: number;
  depth: number;
}

type Color = 'w' | 'b';
interface IMove {
  color: Color;
  from: number;
  to: number;
  piece: string;
  captured?: string;
  promotion?: string;
  flags: number;
}
interface Internals {
  _moves(opts: { legal: boolean }): IMove[];
  _makeMove(m: IMove): void;
  _undoMove(): unknown;
  _isKingAttacked(color: Color): boolean;
  _board: ({ type: string; color: Color } | undefined)[];
  _turn: Color;
  _hash: bigint;
  _positionCount: Map<bigint, number>;
  _halfMoves: number;
}

const MATE = 100000;
const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const PHASE: Record<string, number> = { p: 0, n: 1, b: 1, r: 2, q: 4, k: 0 };

// Piece-square tables, white's view, index 0 = a8 ... 63 = h1.
// prettier-ignore
const PST: Record<string, number[]> = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0],
  n: [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50],
  b: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0],
  q: [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20],
};
// prettier-ignore
const K_MID = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20];
// prettier-ignore
const K_END = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50];

/** Static evaluation from the side to move's point of view. */
function evaluate(c: Internals): number {
  const board = c._board;
  let score = 0;
  let kMid = 0;
  let kEnd = 0;
  let phase = 0;
  let wb = 0;
  let bb = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const p = board[sq];
    if (!p) continue;
    const row = sq >> 4;
    const col = sq & 7;
    const white = p.color === 'w';
    const idx = white ? row * 8 + col : (7 - row) * 8 + col;
    const sign = white ? 1 : -1;
    if (p.type === 'k') {
      kMid += sign * K_MID[idx];
      kEnd += sign * K_END[idx];
    } else {
      score += sign * (VAL[p.type] + PST[p.type][idx]);
      phase += PHASE[p.type];
      if (p.type === 'b') white ? wb++ : bb++;
    }
  }
  if (wb >= 2) score += 30;
  if (bb >= 2) score -= 30;
  const ph = Math.min(phase, 24) / 24;
  score += Math.round(kMid * ph + kEnd * (1 - ph));
  return c._turn === 'w' ? score : -score;
}

const sqName = (sq: number) => 'abcdefgh'[sq & 7] + (8 - (sq >> 4));
const moveKey = (m: IMove) => m.from | (m.to << 8) | ((m.promotion ? m.promotion.charCodeAt(0) : 0) << 16);

interface TTEntry {
  depth: number;
  score: number;
  flag: 0 | 1 | 2; // 0 exact, 1 lower bound, 2 upper bound
  best: number;
}

class Timeout extends Error {}

class Searcher {
  nodes = 0;
  tt = new Map<bigint, TTEntry>();
  killers: number[][] = [];
  path: bigint[] = [];

  private c: Internals;
  private deadline: number;

  constructor(c: Internals, deadline: number) {
    this.c = c;
    this.deadline = deadline;
  }

  private order(moves: IMove[], ttBest: number, ply: number): IMove[] {
    const k = this.killers[ply] ?? [];
    const scored = moves.map((m) => {
      const key = moveKey(m);
      let s = 0;
      if (key === ttBest) s = 1_000_000;
      else if (m.captured) s = 100_000 + 10 * VAL[m.captured] - VAL[m.piece];
      else if (m.promotion) s = 90_000 + VAL[m.promotion];
      else if (k.includes(key)) s = 50_000;
      return { m, s };
    });
    scored.sort((a, b) => b.s - a.s);
    return scored.map((x) => x.m);
  }

  private tick() {
    if ((++this.nodes & 1023) === 0 && Date.now() > this.deadline) throw new Timeout();
  }

  quiesce(alpha: number, beta: number, qdepth: number): number {
    this.tick();
    const stand = evaluate(this.c);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (qdepth <= 0) return alpha;
    const moves = this.c._moves({ legal: true }).filter((m) => m.captured || m.promotion);
    for (const m of this.order(moves, -1, 63)) {
      // Delta pruning: skip captures that can't possibly raise alpha.
      if (!m.promotion && stand + VAL[m.captured!] + 200 < alpha) continue;
      this.c._makeMove(m);
      let score: number;
      try {
        score = -this.quiesce(-beta, -alpha, qdepth - 1);
      } finally {
        this.c._undoMove();
      }
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  negamax(depth: number, alpha: number, beta: number, ply: number): number {
    this.tick();
    const c = this.c;
    const hash = c._hash;
    if (ply > 0) {
      if (c._halfMoves >= 100) return 0;
      if ((c._positionCount.get(hash) ?? 0) >= 1 || this.path.includes(hash)) return 0;
    }
    const inCheck = c._isKingAttacked(c._turn);
    if (inCheck) depth++; // check extension
    if (depth <= 0) return this.quiesce(alpha, beta, 6);

    const alpha0 = alpha;
    const tte = this.tt.get(hash);
    if (tte && tte.depth >= depth && ply > 0) {
      if (tte.flag === 0) return tte.score;
      if (tte.flag === 1 && tte.score >= beta) return tte.score;
      if (tte.flag === 2 && tte.score <= alpha) return tte.score;
    }

    const moves = c._moves({ legal: true });
    if (moves.length === 0) return inCheck ? -MATE + ply : 0;

    let best = -Infinity;
    let bestKey = -1;
    this.path.push(hash);
    try {
      for (const m of this.order(moves, tte?.best ?? -1, ply)) {
        c._makeMove(m);
        let score: number;
        try {
          score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
        } finally {
          c._undoMove();
        }
        if (score > best) {
          best = score;
          bestKey = moveKey(m);
        }
        if (score > alpha) alpha = score;
        if (alpha >= beta) {
          if (!m.captured) {
            const k = (this.killers[ply] ??= []);
            if (!k.includes(bestKey)) {
              k.unshift(bestKey);
              k.length = Math.min(k.length, 2);
            }
          }
          break;
        }
      }
    } finally {
      this.path.pop();
    }

    if (this.tt.size > 300_000) this.tt.clear();
    this.tt.set(hash, {
      depth,
      score: best,
      flag: best <= alpha0 ? 2 : best >= beta ? 1 : 0,
      best: bestKey,
    });
    return best;
  }

  /** Score every root move at `depth` with a full window (used for noisy levels). */
  scoreRoot(moves: IMove[], depth: number): Map<IMove, number> {
    const out = new Map<IMove, number>();
    for (const m of moves) {
      this.c._makeMove(m);
      try {
        out.set(m, -this.negamax(depth - 1, -MATE - 1, MATE + 1, 1));
      } finally {
        this.c._undoMove();
      }
    }
    return out;
  }
}

const LEVELS: Record<Level, { maxDepth: number; timeMs: number; noise: number; randomPick: number }> = {
  easy: { maxDepth: 2, timeMs: 400, noise: 180, randomPick: 0.12 },
  medium: { maxDepth: 3, timeMs: 900, noise: 35, randomPick: 0 },
  hard: { maxDepth: 8, timeMs: 1600, noise: 0, randomPick: 0 },
};

function toResult(m: IMove, score: number, depth: number): SearchResult {
  return { from: sqName(m.from), to: sqName(m.to), promotion: m.promotion, score, depth };
}

/** Pick the bot's move. `sanHistory` replays the game so repetitions are known. */
export function findBestMove(sanHistory: string[], level: Level): SearchResult | null {
  const game = new Chess();
  for (const san of sanHistory) game.move(san);
  const c = game as unknown as Internals;
  if (typeof c._moves !== 'function' || typeof c._makeMove !== 'function') {
    return fallbackMove(game);
  }

  const cfg = LEVELS[level];
  const rootMoves = c._moves({ legal: true });
  if (rootMoves.length === 0) return null;
  if (rootMoves.length === 1) return toResult(rootMoves[0], 0, 0);

  const searcher = new Searcher(c, Date.now() + cfg.timeMs);

  if (cfg.noise > 0) {
    // Score all root moves, then pick with noise so weaker bots make human-ish mistakes.
    let scores = new Map<IMove, number>();
    let depthDone = 0;
    for (let d = 1; d <= cfg.maxDepth; d++) {
      try {
        scores = searcher.scoreRoot(rootMoves, d);
        depthDone = d;
      } catch (e) {
        if (!(e instanceof Timeout)) throw e;
        break;
      }
    }
    if (depthDone === 0) return toResult(rootMoves[Math.floor(Math.random() * rootMoves.length)], 0, 0);
    if (Math.random() < cfg.randomPick) {
      const m = rootMoves[Math.floor(Math.random() * rootMoves.length)];
      return toResult(m, scores.get(m) ?? 0, depthDone);
    }
    let pick = rootMoves[0];
    let pickScore = -Infinity;
    for (const [m, s] of scores) {
      // Never blunder into a mate the bot can see; noise only blurs ordinary moves.
      const noisy = Math.abs(s) > MATE / 2 ? s : s + (Math.random() * 2 - 1) * cfg.noise;
      if (noisy > pickScore) {
        pickScore = noisy;
        pick = m;
      }
    }
    return toResult(pick, scores.get(pick) ?? 0, depthDone);
  }

  // Full strength: iterative deepening alpha-beta.
  let best: IMove = rootMoves[0];
  let bestScore = 0;
  let depthDone = 0;
  for (let d = 1; d <= cfg.maxDepth; d++) {
    try {
      const score = searcher.negamax(d, -MATE - 1, MATE + 1, 0);
      const entry = searcher.tt.get(c._hash);
      const found = entry && rootMoves.find((m) => moveKey(m) === entry.best);
      if (found) {
        best = found;
        bestScore = score;
        depthDone = d;
      }
      if (Math.abs(score) > MATE / 2) break; // found a forced mate
    } catch (e) {
      if (!(e instanceof Timeout)) throw e;
      break;
    }
  }
  return toResult(best, bestScore, depthDone);
}

/** Public-API fallback: one-ply greedy search. Slow but always works. */
function fallbackMove(game: Chess): SearchResult | null {
  const moves = game.moves({ verbose: true });
  if (moves.length === 0) return null;
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const s = (m.captured ? VAL[m.captured] : 0) + (m.promotion ? VAL[m.promotion] : 0) + Math.random() * 20;
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return { from: best.from, to: best.to, promotion: best.promotion, score: 0, depth: 1 };
}
