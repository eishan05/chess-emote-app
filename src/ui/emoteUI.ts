import { CHAR_EMOTES, TEXT_EMOTES, emoteArtSvg, getEmote } from '../emotes';
import type { Side } from '../pieces';
import { play } from '../sound';
import { h, icon } from './dom';

const BURST_LIMIT = 3; // emotes allowed inside BURST_WINDOW before a cooldown
const BURST_WINDOW_MS = 8000;
const COOLDOWN_MS = 6000;

/**
 * The emote button + picker panel, the speech bubbles that pop out of a
 * player's banner, and the anti-spam cooldown.
 */
export class EmoteUI {
  readonly root: HTMLElement;
  onSend: (id: string) => void = () => {};

  private button: HTMLButtonElement;
  private ring: HTMLElement;
  private panel: HTMLElement;
  private sent: number[] = [];
  private lockedUntil = 0;
  private raf = 0;
  private side: Side = 'w';
  private bubbles = new WeakMap<HTMLElement, { el: HTMLElement; timer: number }>();

  constructor() {
    this.ring = h('span', { class: 'cooldown-ring' });
    this.button = h(
      'button',
      { class: 'emote-btn', 'aria-label': 'Emotes', 'aria-expanded': 'false', title: 'Emotes (1–8)' },
      icon('emote'),
      this.ring,
    );
    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    this.panel = h('div', { class: 'emote-panel', role: 'dialog', 'aria-label': 'Choose an emote' });
    this.root = h('div', { class: 'emote-ctl' }, this.button, this.panel);
    this.buildPanel();

    document.addEventListener('pointerdown', this.onDocPointer);
  }

  private onDocPointer = (e: PointerEvent) => {
    if (!this.root.contains(e.target as Node)) this.close();
  };

  /** Re-tint the character thumbnails to the local player's piece colour. */
  setSide(side: Side) {
    if (side === this.side) return;
    this.side = side;
    this.buildPanel();
  }

  private buildPanel() {
    this.panel.textContent = '';
    const phrases = h('div', { class: 'phrase-grid' });
    for (const t of TEXT_EMOTES) {
      phrases.append(h('button', { class: 'phrase', onclick: () => this.trySend(t.id) }, t.text));
    }
    const chars = h('div', { class: 'char-grid' });
    CHAR_EMOTES.forEach((c, i) => {
      const b = h('button', { class: 'char', title: `${c.label} (${i + 1})`, 'aria-label': c.label, onclick: () => this.trySend(c.id) });
      b.innerHTML = emoteArtSvg(c, this.side);
      b.append(h('span', { class: 'key' }, String(i + 1)));
      chars.append(b);
    });
    this.panel.append(chars, phrases);
  }

  setEnabled(on: boolean) {
    this.root.classList.toggle('hidden', !on);
    if (!on) this.close();
  }

  toggle() {
    if (this.panel.classList.contains('open')) this.close();
    else this.open();
  }

  open() {
    if (Date.now() < this.lockedUntil) return this.nope();
    this.panel.classList.add('open');
    this.button.setAttribute('aria-expanded', 'true');
    play('pop');
  }

  close() {
    this.panel.classList.remove('open');
    this.button.setAttribute('aria-expanded', 'false');
  }

  /** Send by id (used by the panel and the 1–8 hotkeys). */
  trySend(id: string) {
    const now = Date.now();
    if (now < this.lockedUntil) return this.nope();
    this.sent = this.sent.filter((t) => now - t < BURST_WINDOW_MS);
    this.sent.push(now);
    if (this.sent.length >= BURST_LIMIT) {
      this.sent = [];
      this.startCooldown(COOLDOWN_MS);
    }
    this.close();
    this.onSend(id);
  }

  sendByIndex(i: number) {
    const e = CHAR_EMOTES[i];
    if (e && !this.root.classList.contains('hidden')) this.trySend(e.id);
  }

  private nope() {
    this.button.classList.remove('shake');
    void this.button.offsetWidth;
    this.button.classList.add('shake');
  }

  private startCooldown(ms: number) {
    this.lockedUntil = Date.now() + ms;
    this.button.classList.add('cooling');
    cancelAnimationFrame(this.raf);
    const tick = () => {
      const left = this.lockedUntil - Date.now();
      if (left <= 0) {
        this.button.classList.remove('cooling');
        this.ring.style.setProperty('--p', '0');
        return;
      }
      this.ring.style.setProperty('--p', String(left / ms));
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  /** Pop a speech bubble out of `anchor` (a player banner). */
  showBubble(anchor: HTMLElement, id: string, side: Side, placement: 'above' | 'below', withSound = true) {
    const emote = getEmote(id);
    if (!emote) return;
    const prev = this.bubbles.get(anchor);
    if (prev) {
      clearTimeout(prev.timer);
      prev.el.remove();
    }
    const el = h('div', { class: `bubble ${placement} ${emote.kind}`, role: 'status' });
    if (emote.kind === 'char') {
      el.innerHTML = emoteArtSvg(emote, side).replace('class="emote-art', 'class="emote-art play');
      el.setAttribute('aria-label', emote.label);
    } else {
      el.textContent = emote.text;
    }
    anchor.append(el);
    if (withSound) play(emote.sound);
    const life = emote.kind === 'char' ? 3200 : 2600;
    const timer = window.setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
      this.bubbles.delete(anchor);
    }, life);
    this.bubbles.set(anchor, { el, timer });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('pointerdown', this.onDocPointer);
  }
}
