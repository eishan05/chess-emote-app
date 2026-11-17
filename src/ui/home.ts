import { BOTS, type Persona } from '../botBrain';
import { CHAR_EMOTES, emoteArtSvg } from '../emotes';
import { pieceSvg, type Side } from '../pieces';
import { h, storageGet, storageSet } from './dom';

export interface HomeHandlers {
  onBot(persona: Persona, side: Side, name: string): void;
  onCreate(side: Side | 'random', name: string): void;
  onJoin(code: string, name: string): void;
}

const ADJ = ['Sneaky', 'Brave', 'Lucky', 'Wobbly', 'Mighty', 'Sleepy', 'Cheeky', 'Turbo', 'Fancy', 'Grumpy'];
const NOUN = ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'];
const randomName = () => `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`;

export function getPlayerName(): string {
  let n = storageGet('checkmoji.name');
  if (!n) {
    n = randomName();
    storageSet('checkmoji.name', n);
  }
  return n;
}

function colorPicker(initial: Side | 'random') {
  let value: Side | 'random' = initial;
  const el = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Your colour' });
  const opts: [Side | 'random', string, string][] = [
    ['w', 'White', pieceSvg('k', 'w')],
    ['random', 'Random', `<span class="rand-icon">?</span>`],
    ['b', 'Black', pieceSvg('k', 'b')],
  ];
  for (const [v, label, art] of opts) {
    const b = h('button', { class: 'seg-opt', role: 'radio', 'aria-checked': String(v === value), type: 'button' });
    b.innerHTML = `<span class="seg-art">${art}</span><span>${label}</span>`;
    b.onclick = () => {
      value = v;
      el.querySelectorAll('.seg-opt').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    };
    el.append(b);
  }
  return { el, get: () => value };
}

export function mountHome(root: HTMLElement, handlers: HomeHandlers): () => void {
  const nameInput = h('input', { class: 'name-input', maxlength: 16, 'aria-label': 'Your name', spellcheck: 'false' });
  nameInput.value = getPlayerName();
  const name = () => {
    const n = nameInput.value.trim().slice(0, 16) || randomName();
    storageSet('checkmoji.name', n);
    return n;
  };

  // --- Emote showcase: a bubble cycling through the emotes ---
  const showcase = h('div', { class: 'showcase-bubble' });
  let idx = 0;
  const showNext = () => {
    const e = CHAR_EMOTES[idx++ % CHAR_EMOTES.length];
    const side: Side = idx % 2 ? 'w' : 'b';
    showcase.innerHTML = emoteArtSvg(e, side).replace('class="emote-art', 'class="emote-art play');
    showcase.classList.remove('pop');
    void showcase.offsetWidth;
    showcase.classList.add('pop');
  };
  showNext();
  const cycle = setInterval(showNext, 3000);

  // --- Bot card ---
  let persona = BOTS[1];
  const botList = h('div', { class: 'bot-list', role: 'radiogroup', 'aria-label': 'Choose a bot' });
  for (const p of BOTS) {
    const b = h('button', { class: `bot-opt lvl-${p.id}`, role: 'radio', 'aria-checked': String(p === persona), type: 'button' });
    b.innerHTML = `<span class="bot-avatar">${pieceSvg(p.avatar, 'b')}</span>
      <span class="bot-text"><span class="bot-name">${p.name}</span><span class="bot-diff">${p.difficulty}</span><span class="bot-blurb">${p.blurb}</span></span>`;
    b.onclick = () => {
      persona = p;
      botList.querySelectorAll('.bot-opt').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    };
    botList.append(b);
  }
  const botColor = colorPicker('w');
  const botStart = h('button', { class: 'btn gold big' }, 'Battle!');
  botStart.onclick = () => {
    const c = botColor.get();
    handlers.onBot(persona, c === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : c, name());
  };

  // --- Friend card ---
  const friendColor = colorPicker('random');
  const createBtn = h('button', { class: 'btn blue big' }, 'Create game');
  createBtn.onclick = () => handlers.onCreate(friendColor.get(), name());
  const codeInput = h('input', { class: 'code-input', maxlength: 5, placeholder: 'CODE', 'aria-label': 'Game code', autocapitalize: 'characters', spellcheck: 'false' });
  codeInput.addEventListener('input', () => (codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  const joinBtn = h('button', { class: 'btn green' }, 'Join');
  const join = () => {
    const code = codeInput.value.trim();
    if (code.length !== 5) {
      codeInput.classList.remove('shake');
      void codeInput.offsetWidth;
      codeInput.classList.add('shake');
      codeInput.focus();
      return;
    }
    handlers.onJoin(code, name());
  };
  joinBtn.onclick = join;
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());

  const screen = h(
    'div',
    { class: 'home' },
    h(
      'header',
      { class: 'hero' },
      h('div', { class: 'hero-stage' }, showcase, h('div', { class: 'hero-king', html: pieceSvg('k', 'w') })),
      h('h1', { class: 'logo' }, 'CHECK', h('span', {}, 'MOJI')),
      h('p', { class: 'tagline' }, 'Chess with trash talk. Make your move, then make your face.'),
    ),
    h('label', { class: 'name-card card' }, h('span', { class: 'label' }, 'Your name'), nameInput),
    h(
      'div',
      { class: 'mode-grid' },
      h(
        'section',
        { class: 'card mode-card' },
        h('h2', {}, 'Play vs Bot'),
        h('p', { class: 'dim' }, 'Bots play, react and emote back.'),
        botList,
        botColor.el,
        botStart,
      ),
      h(
        'section',
        { class: 'card mode-card' },
        h('h2', {}, 'Play a Friend'),
        h('p', { class: 'dim' }, 'Create a game and send the link.'),
        friendColor.el,
        createBtn,
        h('div', { class: 'divider' }, h('span', {}, 'or join with a code')),
        h('div', { class: 'join-row' }, codeInput, joinBtn),
      ),
    ),
    h('footer', { class: 'home-foot dim' }, 'Emotes: 8 animated characters + 6 quick-chat phrases. Press 1–8 in game.'),
  );
  root.replaceChildren(screen);

  return () => clearInterval(cycle);
}
