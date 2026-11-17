import type { Chess, Move, Square } from 'chess.js';
import { pieceSvg, type PieceType, type Side } from './pieces';

const FILES = 'abcdefgh';
const PROMO_CHOICES: PieceType[] = ['q', 'n', 'r', 'b'];

export interface LastMove {
  from: Square;
  to: Square;
}

interface PieceEl {
  el: HTMLElement;
  type: PieceType;
  color: Side;
  square: Square;
}

interface DragState {
  from: Square;
  piece: PieceEl;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  wasSelected: boolean;
}

/**
 * DOM chessboard: click-to-move and drag-and-drop, legal-move hints,
 * last-move / check highlights, animated piece movement and a promotion picker.
 * It never mutates the game; it reports user moves through `onUserMove`.
 */
export class BoardView {
  readonly el: HTMLElement;
  onUserMove: (from: Square, to: Square, promotion?: PieceType) => void = () => {};

  private squaresEl: HTMLElement;
  private piecesEl: HTMLElement;
  private promoEl: HTMLElement;
  private squareEls = new Map<Square, HTMLElement>();
  private pieces: PieceEl[] = [];
  private orientation: Side = 'w';
  private chess: Chess | null = null;
  private interactive: Side | null = null;
  private selected: Square | null = null;
  private targets: Move[] = [];
  private lastMove: LastMove | null = null;
  private drag: DragState | null = null;
  private hoverSq: Square | null = null;
  private promoOpen = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'board';
    this.squaresEl = div('board-squares');
    this.piecesEl = div('board-pieces');
    this.promoEl = div('promo-layer');
    this.el.append(this.squaresEl, this.piecesEl, this.promoEl);
    this.buildSquares();

    this.el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.el.addEventListener('pointercancel', () => this.cancelDrag());
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setOrientation(side: Side) {
    if (side === this.orientation) return;
    this.orientation = side;
    this.buildSquares();
    for (const p of this.pieces) this.placePiece(p, false);
    this.paintHighlights();
  }

  getOrientation() {
    return this.orientation;
  }

  /** Which colour the local user may move (null = view only). */
  setInteractive(side: Side | null) {
    this.interactive = side;
    if (!side) this.deselect();
  }

  setPosition(chess: Chess, lastMove: LastMove | null, animate = true) {
    this.chess = chess;
    this.lastMove = lastMove;
    this.syncPieces(animate);
    if (this.selected && !this.canPick(this.selected)) this.deselect();
    else if (this.selected) this.select(this.selected);
    this.paintHighlights();
  }

  // ---------- layout ----------

  private buildSquares() {
    this.squaresEl.textContent = '';
    this.squareEls.clear();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const sq = this.squareAt(col, row);
        const fileIdx = FILES.indexOf(sq[0]);
        const rank = Number(sq[1]);
        const el = div(`sq ${(fileIdx + rank) % 2 === 0 ? 'light' : 'dark'}`);
        el.dataset.square = sq;
        if (col === 0) el.append(span('coord rank', String(rank)));
        if (row === 7) el.append(span('coord file', sq[0]));
        el.append(div('hint'));
        this.squaresEl.append(el);
        this.squareEls.set(sq, el);
      }
    }
  }

  private squareAt(col: number, row: number): Square {
    return (this.orientation === 'w' ? FILES[col] + (8 - row) : FILES[7 - col] + (row + 1)) as Square;
  }

  private coordsOf(sq: Square): [number, number] {
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]);
    return this.orientation === 'w' ? [f, 8 - r] : [7 - f, r - 1];
  }

  private squareFromPoint(x: number, y: number): Square | null {
    const rect = this.el.getBoundingClientRect();
    const col = Math.floor(((x - rect.left) / rect.width) * 8);
    const row = Math.floor(((y - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return this.squareAt(col, row);
  }

  private placePiece(p: PieceEl, animate: boolean) {
    this.placePieceAt(p, p.square, animate);
  }

  private placePieceAt(p: PieceEl, sq: Square, animate: boolean) {
    const [col, row] = this.coordsOf(sq);
    p.el.classList.toggle('no-anim', !animate);
    p.el.style.transform = `translate(${col * 100}%, ${row * 100}%)`;
  }

  // ---------- piece syncing ----------

  private syncPieces(animate: boolean) {
    if (!this.chess) return;
    const want: { square: Square; type: PieceType; color: Side }[] = [];
    for (const row of this.chess.board()) {
      for (const cell of row) if (cell) want.push({ square: cell.square, type: cell.type, color: cell.color });
    }

    const pool = [...this.pieces];
    const next: PieceEl[] = [];
    const unmatched: typeof want = [];

    // 1) pieces that didn't move
    for (const w of want) {
      const i = pool.findIndex((p) => p.square === w.square && p.type === w.type && p.color === w.color);
      if (i >= 0) next.push(pool.splice(i, 1)[0]);
      else unmatched.push(w);
    }
    // 2) moved pieces: same kind, prefer the last-move origin, else the nearest
    for (const w of unmatched) {
      const candidates = pool.filter((p) => p.type === w.type && p.color === w.color);
      let pick: PieceEl | undefined =
        candidates.find((p) => this.lastMove && p.square === this.lastMove.from) ??
        candidates.sort((a, b) => dist(a.square, w.square) - dist(b.square, w.square))[0];
      if (pick) {
        pool.splice(pool.indexOf(pick), 1);
        pick.square = w.square;
        this.placePiece(pick, animate);
      } else {
        // 3) brand-new piece (promotion or initial setup)
        const el = div('piece');
        el.innerHTML = pieceSvg(w.type, w.color);
        pick = { el, type: w.type, color: w.color, square: w.square };
        this.placePiece(pick, false);
        if (animate) el.classList.add('appear');
        this.piecesEl.append(el);
      }
      next.push(pick);
    }
    // 4) captured pieces fade out
    for (const p of pool) {
      if (animate) {
        p.el.classList.add('captured');
        setTimeout(() => p.el.remove(), 260);
      } else p.el.remove();
    }
    this.pieces = next;
  }

  // ---------- highlights ----------

  private paintHighlights() {
    const checkSq = this.chess?.inCheck() ? this.kingSquare(this.chess.turn()) : null;
    const targetMap = new Map(this.targets.map((m) => [m.to, m]));
    for (const [sq, el] of this.squareEls) {
      el.classList.toggle('last', !!this.lastMove && (this.lastMove.from === sq || this.lastMove.to === sq));
      el.classList.toggle('selected', this.selected === sq);
      el.classList.toggle('check', checkSq === sq);
      const t = targetMap.get(sq);
      el.classList.toggle('dest', !!t && !t.captured);
      el.classList.toggle('dest-capture', !!t && !!t.captured);
      el.classList.toggle('hover', this.hoverSq === sq && !!t);
    }
  }

  private kingSquare(color: Side): Square | null {
    for (const row of this.chess!.board()) {
      for (const c of row) if (c && c.type === 'k' && c.color === color) return c.square;
    }
    return null;
  }

  // ---------- selection & input ----------

  private canPick(sq: Square): boolean {
    if (!this.chess || !this.interactive || this.promoOpen) return false;
    const p = this.chess.get(sq);
    return !!p && p.color === this.interactive && this.chess.turn() === this.interactive;
  }

  private select(sq: Square) {
    this.selected = sq;
    this.targets = this.chess!.moves({ square: sq, verbose: true });
    this.paintHighlights();
  }

  private deselect() {
    this.selected = null;
    this.targets = [];
    this.hoverSq = null;
    this.paintHighlights();
  }

  private isTarget(sq: Square) {
    return this.targets.some((m) => m.to === sq);
  }

  private onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || this.promoOpen || !this.chess) return;
    const sq = this.squareFromPoint(e.clientX, e.clientY);
    if (!sq) return;
    if (this.selected && sq !== this.selected && this.isTarget(sq)) {
      this.attemptMove(this.selected, sq);
      return;
    }
    if (this.canPick(sq)) {
      const piece = this.pieces.find((p) => p.square === sq);
      const wasSelected = this.selected === sq;
      this.select(sq);
      if (piece) {
        this.drag = { from: sq, piece, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, wasSelected };
        this.el.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
    } else {
      this.deselect();
    }
  }

  private onPointerMove(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
    if (!d.moved) {
      d.moved = true;
      d.piece.el.classList.add('dragging', 'no-anim');
    }
    const rect = this.el.getBoundingClientRect();
    const size = rect.width / 8;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    d.piece.el.style.transform = `translate(${x}px, ${y}px) scale(1.12)`;
    const over = this.squareFromPoint(e.clientX, e.clientY);
    if (over !== this.hoverSq) {
      this.hoverSq = over;
      this.paintHighlights();
    }
  }

  private onPointerUp(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drag = null;
    d.piece.el.classList.remove('dragging');
    const sq = this.squareFromPoint(e.clientX, e.clientY);
    if (d.moved) {
      this.hoverSq = null;
      if (sq && sq !== d.from && this.isTarget(sq)) {
        // Snap straight to the drop square instead of sliding from the origin.
        this.placePieceAt(d.piece, sq, false);
        this.attemptMove(d.from, sq);
      } else {
        this.placePiece(d.piece, true);
        if (sq !== d.from) this.deselect();
        else this.paintHighlights();
      }
    } else if (d.wasSelected) {
      this.deselect();
    }
  }

  private cancelDrag() {
    if (!this.drag) return;
    this.drag.piece.el.classList.remove('dragging');
    this.placePiece(this.drag.piece, true);
    this.drag = null;
    this.hoverSq = null;
    this.paintHighlights();
  }

  private attemptMove(from: Square, to: Square) {
    const options = this.targets.filter((m) => m.to === to);
    if (options.length === 0) return;
    if (options.some((m) => m.promotion)) {
      this.openPromotion(from, to);
      return;
    }
    this.deselect();
    this.onUserMove(from, to);
  }

  private openPromotion(from: Square, to: Square) {
    const color = this.chess!.get(from)?.color ?? 'w';
    const [col, row] = this.coordsOf(to);
    this.promoOpen = true;
    this.promoEl.textContent = '';
    this.promoEl.classList.add('open');
    const column = div('promo-column');
    column.style.left = `${col * 12.5}%`;
    const fromTop = row === 0;
    column.style[fromTop ? 'top' : 'bottom'] = '0';
    column.classList.toggle('from-bottom', !fromTop);
    for (const type of PROMO_CHOICES) {
      const btn = document.createElement('button');
      btn.className = 'promo-choice';
      btn.innerHTML = pieceSvg(type, color);
      btn.setAttribute('aria-label', `Promote to ${type}`);
      btn.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        this.closePromotion();
        this.deselect();
        this.onUserMove(from, to, type);
      });
      column.append(btn);
    }
    this.promoEl.append(column);
    const cancel = (ev: PointerEvent) => {
      if ((ev.target as HTMLElement).closest('.promo-choice')) return;
      ev.stopPropagation();
      this.closePromotion();
      for (const p of this.pieces) this.placePiece(p, true);
      this.deselect();
    };
    this.promoEl.onpointerdown = cancel;
  }

  private closePromotion() {
    this.promoOpen = false;
    this.promoEl.classList.remove('open');
    this.promoEl.textContent = '';
    this.promoEl.onpointerdown = null;
  }
}

function dist(a: Square, b: Square) {
  return Math.abs(FILES.indexOf(a[0]) - FILES.indexOf(b[0])) + Math.abs(Number(a[1]) - Number(b[1]));
}

function div(cls: string) {
  const el = document.createElement('div');
  el.className = cls;
  return el;
}

function span(cls: string, text: string) {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
}
