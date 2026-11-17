import type { Chess } from 'chess.js';
import { BoardView } from '../board';
import type { BotGame, GameController, NoticeKind } from '../game';
import { PIECE_VALUE, pieceSvg, type PieceType, type Side } from '../pieces';
import { isSoundOn, play, setSoundOn } from '../sound';
import { EmoteUI } from './emoteUI';
import { copyText, h, icon, ICONS } from './dom';

const START_COUNT: Record<Exclude<PieceType, 'k'>, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const other = (s: Side): Side => (s === 'w' ? 'b' : 'w');

function material(chess: Chess) {
  const have: Record<Side, Record<string, number>> = { w: {}, b: {} };
  let score = 0;
  for (const row of chess.board()) {
    for (const c of row) {
      if (!c) continue;
      have[c.color][c.type] = (have[c.color][c.type] ?? 0) + 1;
      score += (c.color === 'w' ? 1 : -1) * PIECE_VALUE[c.type];
    }
  }
  // Pieces each side has captured = the other side's missing pieces.
  const captured: Record<Side, PieceType[]> = { w: [], b: [] };
  for (const side of ['w', 'b'] as const) {
    for (const t of ['q', 'r', 'b', 'n', 'p'] as const) {
      const missing = Math.max(0, START_COUNT[t] - (have[other(side)][t] ?? 0));
      for (let i = 0; i < missing; i++) captured[side].push(t);
    }
  }
  return { captured, score };
}

interface Banner {
  el: HTMLElement;
  avatar: HTMLElement;
  name: HTMLElement;
  tag: HTMLElement;
  dot: HTMLElement;
  thinking: HTMLElement;
  caps: HTMLElement;
  mute: HTMLButtonElement;
}

function makeBanner(pos: 'top' | 'bottom'): Banner {
  const avatar = h('div', { class: 'avatar' });
  const name = h('span', { class: 'name' });
  const tag = h('span', { class: 'tag' });
  const dot = h('span', { class: 'conn-dot', title: 'Connected' });
  const thinking = h('span', { class: 'thinking' }, 'thinking', h('i', {}, '.'), h('i', {}, '.'), h('i', {}, '.'));
  const caps = h('div', { class: 'captures' });
  const mute = h('button', { class: 'mute-btn', title: 'Mute emotes', 'aria-label': 'Mute emotes' });
  const el = h(
    'div',
    { class: `banner ${pos}` },
    avatar,
    h('div', { class: 'who' }, h('div', { class: 'name-row' }, name, tag, dot, thinking), caps),
    mute,
  );
  return { el, avatar, name, tag, dot, thinking, caps, mute };
}

const REASON_TEXT: Record<string, string> = {
  checkmate: 'by checkmate',
  resignation: 'by resignation',
  stalemate: 'by stalemate',
  repetition: 'by threefold repetition',
  'insufficient material': 'by insufficient material',
  '50-move rule': 'by the 50-move rule',
  agreement: 'by agreement',
};

/** Mounts the in-game screen. Returns a cleanup function. */
export function mountGame(root: HTMLElement, game: GameController, opts: { onExit: () => void }): () => void {
  const board = new BoardView();
  const emotes = new EmoteUI();
  const top = makeBanner('top');
  const bottom = makeBanner('bottom');
  const overlay = h('div', { class: 'board-overlay' });
  const toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  const moveList = h('ol', { class: 'move-list' });
  let flipped = false;
  let mutedOpp = false;
  let overlayKey = '';
  let prevStatus = game.status;
  let drawToast: HTMLElement | null = null;
  let resignArmed = 0;

  // ----- header -----
  const soundBtn = h('button', { class: 'icon-btn', 'aria-label': 'Toggle sound', title: 'Sound' });
  const paintSound = () => (soundBtn.innerHTML = isSoundOn() ? ICONS.sound : ICONS.soundOff);
  paintSound();
  soundBtn.onclick = () => {
    setSoundOn(!isSoundOn());
    paintSound();
  };
  const roomChip = h('button', { class: 'room-chip hidden', title: 'Copy invite link' });
  roomChip.onclick = async () => {
    if (game.roomCode && (await copyText(inviteLink()))) toast('Invite link copied!');
  };
  const homeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Home', title: 'Home', html: ICONS.home });
  homeBtn.onclick = () => {
    if (game.status === 'playing' && game.mySide && game.chess.history().length > 0) {
      if (!confirm('Leave this game?')) return;
    }
    opts.onExit();
  };
  const modeLabel =
    game.mode === 'bot' ? `vs ${(game as BotGame).persona.name} · ${(game as BotGame).persona.difficulty}` : 'Online match';
  const header = h('header', { class: 'topbar' }, homeBtn, h('div', { class: 'brand-mini' }, 'CHECK', h('span', {}, 'MOJI')), h('div', { class: 'topbar-right' }, roomChip, soundBtn));

  // ----- action bar -----
  const drawBtn = h('button', { class: 'btn small', title: 'Offer a draw' }, h('b', { class: 'half' }, '½'), h('span', { class: 'lbl' }, 'Draw'));
  const resignBtn = h('button', { class: 'btn small red', title: 'Resign' }, icon('flag'), h('span', { class: 'lbl' }, 'Resign'));
  const flipBtn = h('button', { class: 'btn small ghost', title: 'Flip board', 'aria-label': 'Flip board' }, icon('flip'));
  drawBtn.onclick = () => game.offerDraw();
  resignBtn.onclick = () => {
    if (Date.now() < resignArmed) {
      resignArmed = 0;
      resignBtn.querySelector('.lbl')!.textContent = 'Resign';
      game.resign();
    } else {
      resignArmed = Date.now() + 3000;
      resignBtn.querySelector('.lbl')!.textContent = 'Sure?';
      setTimeout(() => {
        if (resignArmed && Date.now() >= resignArmed) resignBtn.querySelector('.lbl')!.textContent = 'Resign';
      }, 3100);
    }
  };
  flipBtn.onclick = () => {
    flipped = !flipped;
    render();
  };
  const actionBar = h('div', { class: 'action-bar' }, emotes.root, h('div', { class: 'actions' }, flipBtn, drawBtn, resignBtn));

  // ----- layout -----
  const boardWrap = h('div', { class: 'board-wrap' }, board.el, overlay);
  const playCol = h('section', { class: 'play-col' }, toasts, top.el, boardWrap, bottom.el, actionBar);
  const side = h(
    'aside',
    { class: 'side-col' },
    h('div', { class: 'panel info-panel' }, h('div', { class: 'mode-label' }, modeLabel)),
    h('div', { class: 'panel moves-panel' }, h('h3', {}, 'Moves'), moveList),
    h(
      'div',
      { class: 'panel tip-panel' },
      h('h3', {}, 'Emotes'),
      h('p', {}, 'Tap the bubble button or press ', h('kbd', {}, '1'), '–', h('kbd', {}, '8'), '. Tap the bubble icon next to a name to mute that player.'),
    ),
  );
  const screen = h('div', { class: 'game-screen' }, header, h('main', { class: 'arena' }, playCol, side));
  root.replaceChildren(screen);

  // ----- helpers -----
  const inviteLink = () => `${location.origin}${location.pathname}?room=${game.roomCode}`;
  const orientation = (): Side => {
    const base = game.mySide ?? 'w';
    return flipped ? other(base) : base;
  };
  const bannerFor = (s: Side) => (s === orientation() ? bottom : top);

  function toast(text: string, actions: { label: string; cls?: string; run: () => void }[] = [], sticky = false) {
    const el = h('div', { class: 'toast' }, h('span', {}, text));
    if (actions.length) {
      const row = h('div', { class: 'toast-actions' });
      for (const a of actions) {
        row.append(
          h('button', {
            class: `btn tiny ${a.cls ?? ''}`,
            onclick: () => {
              a.run();
              dismiss();
            },
          }, a.label),
        );
      }
      el.append(row);
    }
    const dismiss = () => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 250);
    };
    toasts.append(el);
    if (!sticky) setTimeout(dismiss, 3200);
    return el;
  }

  board.onUserMove = (from, to, promotion) => game.move(from, to, promotion);

  emotes.onSend = (id) => {
    const me = game.mySide;
    if (!me) return;
    emotes.showBubble(bannerFor(me).el, id, me, bannerFor(me) === bottom ? 'above' : 'below');
    game.emote(id);
  };

  // ----- game events -----
  game.events = {
    change(info) {
      if (info.newGame) {
        overlayKey = '';
        play('start');
      }
      if (info.moved) {
        const m = info.moved;
        if (!game.chess.isGameOver()) {
          if (m.captured) play('capture');
          else if (m.flags.includes('k') || m.flags.includes('q')) play('castle');
          else play('move');
          if (game.chess.inCheck()) setTimeout(() => play('check'), 90);
        } else if (m.captured) play('capture');
        else play('move');
      }
      render(!!info.moved);
    },
    emote(s, id) {
      if (s !== game.mySide && mutedOpp) return;
      const b = bannerFor(s);
      emotes.showBubble(b.el, id, s, b === bottom ? 'above' : 'below');
    },
    notice(kind: NoticeKind, text) {
      if (kind === 'draw-offer') {
        play('notify');
        return; // the sticky toast is driven by state in render()
      }
      if (kind === 'rematch-offer' || kind === 'muted') play('notify');
      toast(text);
    },
  };

  // ----- rendering -----
  function paintBanner(b: Banner, s: Side, caps: PieceType[], adv: number) {
    const p = game.players[s];
    b.el.className = `banner ${b === top ? 'top' : 'bottom'} side-${s}`;
    b.el.classList.toggle('active', game.status === 'playing' && game.chess.turn() === s);
    b.avatar.innerHTML = p ? pieceSvg(p.avatar, s) : '<span class="avatar-empty">?</span>';
    b.name.textContent = p ? p.name : 'Waiting for opponent…';
    b.el.classList.toggle('empty', !p);
    const isMe = s === game.mySide;
    b.tag.textContent = p?.isBot ? 'BOT' : isMe ? 'YOU' : '';
    b.tag.classList.toggle('hidden', !b.tag.textContent);
    b.dot.classList.toggle('hidden', game.mode !== 'online' || !p);
    b.dot.classList.toggle('off', !!p && !p.connected);
    b.dot.title = p?.connected ? 'Connected' : 'Disconnected';
    b.thinking.classList.toggle('hidden', !p?.thinking);
    b.caps.innerHTML =
      caps.map((t) => `<span class="cap">${pieceSvg(t, other(s))}</span>`).join('') + (adv > 0 ? `<span class="adv">+${adv}</span>` : '');
    const canMute = !!game.mySide && !isMe && !!p;
    b.mute.classList.toggle('hidden', !canMute);
    b.mute.innerHTML = mutedOpp ? ICONS.emoteOff : ICONS.emoteOn;
    b.mute.classList.toggle('muted', mutedOpp);
    b.mute.title = mutedOpp ? 'Unmute emotes' : 'Mute emotes';
    b.mute.onclick = () => {
      mutedOpp = !mutedOpp;
      toast(mutedOpp ? `${p?.name ?? 'Opponent'}'s emotes muted` : `${p?.name ?? 'Opponent'}'s emotes unmuted`);
      render();
    };
  }

  function renderMoves() {
    const sans = game.chess.history();
    moveList.textContent = '';
    for (let i = 0; i < sans.length; i += 2) {
      const li = h('li', {}, h('span', { class: 'num' }, `${i / 2 + 1}.`), h('span', { class: 'san' }, sans[i]));
      if (sans[i + 1]) li.append(h('span', { class: 'san' }, sans[i + 1]));
      moveList.append(li);
    }
    moveList.querySelector('li:last-child .san:last-child')?.classList.add('latest');
    moveList.scrollTop = moveList.scrollHeight;
    moveList.scrollLeft = moveList.scrollWidth;
  }

  function renderOverlay() {
    const g = game;
    const key = [g.status, g.result?.reason, g.result?.winner, g.mySide, g.rematchOffers.join(), g.roomCode].join('|');
    if (key === overlayKey) return;
    overlayKey = key;
    overlay.textContent = '';
    overlay.className = 'board-overlay';
    let card: HTMLElement | null = null;

    if (g.status === 'connecting') {
      card = h('div', { class: 'card overlay-card' }, h('h2', {}, 'Connecting'), h('p', { class: 'dots' }, 'Finding your game', h('i', {}, '.'), h('i', {}, '.'), h('i', {}, '.')));
    } else if (g.status === 'error') {
      card = h(
        'div',
        { class: 'card overlay-card' },
        h('h2', {}, "Couldn't join"),
        h('p', {}, 'That game code doesn’t exist (or the server restarted).'),
        h('button', { class: 'btn blue', onclick: opts.onExit }, 'Back to menu'),
      );
    } else if (g.status === 'waiting') {
      const canShare = typeof navigator.share === 'function';
      card = h(
        'div',
        { class: 'card overlay-card invite' },
        h('h2', {}, 'Invite a friend'),
        h('p', {}, 'Send them this code or link:'),
        h('div', { class: 'big-code' }, g.roomCode ?? '·····'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn blue', onclick: async () => (await copyText(inviteLink())) && toast('Invite link copied!') }, icon('copy'), 'Copy link'),
          canShare && h('button', { class: 'btn ghost', onclick: () => navigator.share({ title: 'Checkmoji', text: 'Play chess with me!', url: inviteLink() }).catch(() => {}) }, icon('share'), 'Share'),
        ),
        h('p', { class: 'dim dots' }, 'Waiting for opponent', h('i', {}, '.'), h('i', {}, '.'), h('i', {}, '.')),
      );
    } else if (g.status === 'over' && g.result) {
      const { winner, reason } = g.result;
      const me = g.mySide;
      const outcome = winner === null ? 'draw' : me === null ? 'neutral' : winner === me ? 'win' : 'lose';
      const title =
        outcome === 'win' ? 'Victory!' : outcome === 'lose' ? 'Defeat' : outcome === 'draw' ? 'Draw' : `${winner === 'w' ? 'White' : 'Black'} wins`;
      const iOffered = !!me && g.rematchOffers.includes(me);
      const theyOffered = !!me && g.rematchOffers.includes(other(me));
      overlay.classList.add(`result-${outcome}`);
      card = h(
        'div',
        { class: `card overlay-card result ${outcome}` },
        h('div', { class: 'result-icon', html: resultIcon(outcome) }),
        h('h2', {}, title),
        h('p', {}, REASON_TEXT[reason] ?? reason),
        me &&
          h(
            'div',
            { class: 'row' },
            h(
              'button',
              { class: `btn ${theyOffered ? 'green pulse' : 'gold'}`, disabled: iOffered, onclick: () => game.rematch() },
              iOffered ? 'Rematch sent…' : theyOffered ? 'Accept rematch' : 'Rematch',
            ),
            h('button', { class: 'btn blue', onclick: opts.onExit }, 'Menu'),
          ),
        h('button', { class: 'link-btn', onclick: () => overlay.classList.add('peek') }, 'View board'),
      );
    }
    if (card) {
      overlay.append(card);
      overlay.classList.add('show');
    }
  }

  function render(moved = false) {
    const orient = orientation();
    board.setOrientation(orient);
    board.setPosition(game.chess, game.lastMove, moved);
    board.setInteractive(game.status === 'playing' && game.mySide ? game.mySide : null);
    emotes.setSide(game.mySide ?? 'w');
    emotes.setEnabled(!!game.mySide && game.status !== 'connecting' && game.status !== 'error');

    const { captured, score } = material(game.chess);
    paintBanner(top, other(orient), captured[other(orient)], other(orient) === 'w' ? score : -score);
    paintBanner(bottom, orient, captured[orient], orient === 'w' ? score : -score);
    renderMoves();
    renderOverlay();

    const playing = game.status === 'playing' && !!game.mySide;
    drawBtn.disabled = !playing || game.drawOffer === game.mySide;
    resignBtn.disabled = !playing;
    roomChip.classList.toggle('hidden', !game.roomCode);
    roomChip.replaceChildren(h('span', { class: 'dim' }, 'Room'), h('b', {}, game.roomCode ?? ''), icon('copy'));

    // Sticky draw-offer toast, driven by state so it survives reconnects.
    const offerForMe = game.status === 'playing' && !!game.drawOffer && !!game.mySide && game.drawOffer !== game.mySide;
    if (offerForMe && !drawToast) {
      const who = game.players[other(game.mySide!)]?.name ?? 'Opponent';
      drawToast = toast(
        `${who} offers a draw`,
        [
          { label: 'Accept', cls: 'green', run: () => game.answerDraw(true) },
          { label: 'Decline', cls: 'red', run: () => game.answerDraw(false) },
        ],
        true,
      );
    } else if (!offerForMe && drawToast) {
      drawToast.remove();
      drawToast = null;
    }

    if (game.status === 'over' && prevStatus !== 'over') {
      const w = game.result?.winner;
      setTimeout(() => play(w === null ? 'draw' : w === game.mySide ? 'win' : game.mySide ? 'lose' : 'draw'), 250);
    }
    if (game.status === 'playing' && (prevStatus === 'waiting' || prevStatus === 'connecting') && game.mode === 'online') {
      play('start');
      if (prevStatus === 'waiting') toast('Opponent joined. Good luck!');
    }
    prevStatus = game.status;
  }

  // ----- keyboard -----
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key >= '1' && e.key <= '8') emotes.sendByIndex(Number(e.key) - 1);
    else if (e.key === 'Escape') {
      emotes.close();
      overlay.classList.remove('peek');
    } else if (e.key === 'f') flipBtn.click();
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (overlay.classList.contains('peek') && e.target === overlay) overlay.classList.remove('peek');
  });

  render();

  return () => {
    document.removeEventListener('keydown', onKey);
    emotes.destroy();
    game.destroy();
  };
}

function resultIcon(outcome: string): string {
  if (outcome === 'win')
    return `<svg viewBox="0 0 100 80"><path d="M10 70 L4 18 L30 40 L50 6 L70 40 L96 18 L90 70 Z" fill="#ffd43b" stroke="#7a4b00" stroke-width="5" stroke-linejoin="round"/><circle cx="4" cy="16" r="6" fill="#ffd43b" stroke="#7a4b00" stroke-width="4"/><circle cx="50" cy="6" r="6" fill="#ffd43b" stroke="#7a4b00" stroke-width="4"/><circle cx="96" cy="16" r="6" fill="#ffd43b" stroke="#7a4b00" stroke-width="4"/><rect x="10" y="62" width="80" height="12" rx="4" fill="#ffb300" stroke="#7a4b00" stroke-width="5"/><circle cx="50" cy="48" r="7" fill="#ff5a7a" stroke="#7a4b00" stroke-width="3"/></svg>`;
  if (outcome === 'lose')
    return `<svg viewBox="0 0 100 80"><path d="M50 6 L58 30 L84 30 L63 45 L71 70 L50 55 L29 70 L37 45 L16 30 L42 30 Z" fill="#8a94b8" stroke="#2b2f45" stroke-width="5" stroke-linejoin="round" transform="rotate(12 50 40)"/></svg>`;
  return `<svg viewBox="0 0 100 80"><circle cx="34" cy="40" r="26" fill="#fdfaf3" stroke="#2b2340" stroke-width="5"/><circle cx="66" cy="40" r="26" fill="#4a4066" stroke="#17121f" stroke-width="5"/></svg>`;
}
