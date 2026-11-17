/**
 * The bot's emote personality: it reacts to captures, blunders, checks,
 * idling, the result, and to your emotes, with a cooldown so it doesn't spam.
 */
import type { Level } from './engine/search';
import type { PieceType } from './pieces';

export interface Persona {
  id: string;
  name: string;
  avatar: PieceType;
  level: Level;
  difficulty: string;
  blurb: string;
  /** 0..1: how often it emotes at all. */
  chatty: number;
  /** 0..1: how often it picks a taunt over a friendly emote. */
  taunt: number;
}

export const BOTS: Persona[] = [
  { id: 'easy', name: 'Pawnderer', avatar: 'p', level: 'easy', difficulty: 'Easy', blurb: 'Just happy to be here.', chatty: 0.9, taunt: 0.15 },
  { id: 'medium', name: 'Knightmare', avatar: 'n', level: 'medium', difficulty: 'Medium', blurb: 'Forks first, questions later.', chatty: 0.75, taunt: 0.5 },
  { id: 'hard', name: 'Checkmatey', avatar: 'r', level: 'hard', difficulty: 'Hard', blurb: 'Arr. Yer king be mine.', chatty: 0.7, taunt: 0.85 },
];

const COOLDOWN_MS = 4500;

const REPLIES: Record<string, { nice: string[]; mean: string[] }> = {
  gl: { nice: ['gl', 'ty', 'thumbs'], mean: ['cool', 'gl'] },
  wp: { nice: ['ty', 'thumbs'], mean: ['cool', 'ty'] },
  wow: { nice: ['thumbs', 'ty'], mean: ['cool'] },
  ty: { nice: ['thumbs'], mean: ['thumbs', 'cool'] },
  oops: { nice: ['thumbs', 'think'], mean: ['laugh', 'cool'] },
  gg: { nice: ['gg', 'wp'], mean: ['gg', 'cool'] },
  thumbs: { nice: ['thumbs', 'ty'], mean: ['cool'] },
  laugh: { nice: ['cry', 'think'], mean: ['angry', 'laugh'] },
  cry: { nice: ['thumbs', 'think'], mean: ['laugh', 'cool'] },
  angry: { nice: ['think', 'shock'], mean: ['laugh', 'cool'] },
  shock: { nice: ['thumbs', 'cool'], mean: ['cool', 'laugh'] },
  think: { nice: ['think', 'sleep'], mean: ['sleep', 'laugh'] },
  cool: { nice: ['shock', 'thumbs'], mean: ['angry', 'laugh'] },
  sleep: { nice: ['shock', 'think'], mean: ['angry', 'sleep'] },
};

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export class BotBrain {
  private lastAt = 0;
  private timers: number[] = [];
  private playerEmotes: number[] = [];
  private mutedUntil = 0;

  constructor(
    private p: Persona,
    private say: (id: string) => void,
  ) {}

  private later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  /** Emote with probability `prob` (scaled by chattiness), respecting the cooldown. */
  private maybe(prob: number, nice: string[], mean: string[] = nice, delay = 700, force = false) {
    const now = Date.now();
    if (!force && now - this.lastAt < COOLDOWN_MS) return;
    if (!force && Math.random() > prob * this.p.chatty) return;
    this.lastAt = now + delay;
    const id = Math.random() < this.p.taunt ? pick(mean) : pick(nice);
    this.later(delay, () => this.say(id));
  }

  onStart() {
    this.maybe(0.85, ['gl'], ['gl', 'cool'], 1200);
  }

  onBotMoved(captured: PieceType | undefined, givesCheck: boolean) {
    if (captured === 'q') this.maybe(1, ['thumbs', 'laugh'], ['laugh', 'cool'], 500);
    else if (captured && captured !== 'p') this.maybe(0.35, ['thumbs'], ['laugh', 'cool'], 500);
    else if (givesCheck) this.maybe(0.25, ['think'], ['cool', 'laugh'], 500);
  }

  onPlayerCaptured(captured: PieceType) {
    if (captured === 'q') this.maybe(1, ['cry', 'shock'], ['angry', 'cry'], 600);
    else if (captured !== 'p') this.maybe(0.35, ['shock', 'think'], ['angry', 'shock'], 600);
  }

  /** `delta` = change in the bot's evaluation caused by the player's last move. */
  onEvalSwing(delta: number) {
    if (delta > 250) this.maybe(0.6, ['oops', 'shock'], ['laugh', 'oops', 'cool'], 300);
    else if (delta < -250) this.maybe(0.6, ['wp', 'shock'], ['shock', 'angry', 'wow'], 300);
  }

  onPlayerIdle() {
    this.maybe(0.8, ['think', 'sleep'], ['sleep'], 0);
  }

  onDrawDeclined() {
    this.maybe(0.8, ['think'], ['laugh', 'cool'], 300, true);
  }

  onGameOver(botWon: boolean | null) {
    this.clear();
    if (botWon === true) {
      this.later(700, () => this.say(Math.random() < this.p.taunt ? pick(['laugh', 'cool']) : 'thumbs'));
      this.later(3600, () => this.say('gg'));
    } else if (botWon === false) {
      this.later(700, () => this.say(Math.random() < this.p.taunt ? 'angry' : 'cry'));
      this.later(3600, () => this.say(pick(['wp', 'gg'])));
    } else {
      this.later(900, () => this.say(pick(['gg', 'think'])));
    }
    this.lastAt = Date.now() + 4000;
  }

  /** Returns true when the bot decides to mute the player for spamming. */
  onPlayerEmote(id: string): boolean {
    const now = Date.now();
    if (now < this.mutedUntil) return false;
    this.playerEmotes = this.playerEmotes.filter((t) => now - t < 10_000);
    this.playerEmotes.push(now);
    if (this.playerEmotes.length >= 4) {
      this.mutedUntil = now + 30_000;
      this.playerEmotes = [];
      return true;
    }
    const r = REPLIES[id];
    if (r) this.maybe(0.6, r.nice, r.mean, 900 + Math.random() * 600);
    return false;
  }

  private clear() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  reset() {
    this.clear();
    this.lastAt = 0;
    this.mutedUntil = 0;
    this.playerEmotes = [];
  }
}
