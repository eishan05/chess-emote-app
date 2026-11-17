/**
 * Emote definitions. Character emotes are original animated SVG cartoons of the
 * chess pieces (120x120 grid); text emotes are quick-chat phrases.
 * Animation classes (a-*, tear, puff, z, ...) are defined in style.css.
 */
import type { Side } from './pieces';
import type { SoundName } from './sound';

export interface CharEmote {
  id: string;
  kind: 'char';
  label: string;
  sound: SoundName;
  art: string;
}
export interface TextEmote {
  id: string;
  kind: 'text';
  text: string;
  sound: SoundName;
}
export type Emote = CharEmote | TextEmote;

const star = (cx: number, cy: number, r: number, cls: string) =>
  `<path class="${cls}" d="M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} Z"/>`;

const DROP = 'M0 -7 C3 -2 5 1 5 3 A5 5 0 0 1 -5 3 C-5 1 -3 -2 0 -7 Z';
const drop = (x: number, y: number, cls: string) =>
  `<g transform="translate(${x} ${y})"><path class="tear ${cls}" d="${DROP}"/></g>`;

const PAWN_BODY = `
  <rect class="f" x="34" y="100" width="52" height="13" rx="6.5"/>
  <path class="f" d="M40 101 Q42 85 51 79 L69 79 Q78 85 80 101 Z"/>
  <path class="s" d="M67 82 Q75 88 76 99 L70 99 Q69 89 64 82 Z"/>
  <rect class="f" x="43" y="72" width="34" height="10" rx="5"/>
  <circle class="f" cx="60" cy="44" r="29"/>
  <path class="s" d="M74.5 18.9 A29 29 0 0 1 74.5 69.1 A36 36 0 0 0 74.5 18.9 Z"/>`;

const KING_BODY = `
  <rect class="f" x="28" y="100" width="64" height="13" rx="6.5"/>
  <path class="f" d="M30 102 C26 74 38 57 60 57 C82 57 94 74 90 102 Z"/>
  <path class="s" d="M77 63 C87 72 90 87 88 100 L80 100 C82 86 80 73 77 63 Z"/>`;

const KING_CROWN = `
  <path class="f" d="M38 61 L33 35 L47 46 L60 31 L73 46 L87 35 L82 61 Z"/>
  <rect class="f" x="56" y="10" width="8" height="25" rx="2.5"/>
  <rect class="f" x="48.5" y="16" width="23" height="8" rx="2.5"/>`;

const THUMBS = `
  <g class="a-bounce">
    ${PAWN_BODY}
    <path class="feat" d="M44 43 Q50 35 56 43"/>
    <path class="feat" d="M64 43 Q70 35 76 43"/>
    <ellipse class="blush" cx="42" cy="54" rx="5.5" ry="3.2"/>
    <ellipse class="blush" cx="78" cy="54" rx="5.5" ry="3.2"/>
    <path class="mouth" d="M47 52 Q60 55 73 52 Q71 67 60 67 Q49 67 47 52 Z"/>
    <path class="tongue" d="M52.5 61.5 Q60 57.5 67.5 61.5 Q65 66.5 60 66.5 Q55 66.5 52.5 61.5 Z"/>
    <g class="a-thumb">
      <rect class="glove" x="84" y="64" width="24" height="22" rx="7"/>
      <rect class="glove" x="87" y="42" width="10" height="26" rx="5"/>
      <path class="o" d="M84 71 H96 M84 78 H96"/>
    </g>
  </g>
  ${star(18, 30, 9, 'spark sp1')}
  ${star(104, 18, 7, 'spark sp2')}
  ${star(16, 84, 6, 'spark sp3')}`;

const LAUGH = `
  <g class="a-laugh">
    <g transform="translate(4 7) scale(1.1)">
      <rect class="f" x="17" y="79" width="66" height="12" rx="6"/>
      <path class="f" d="M30 80 C30 70 34 62 43 55 C37 57 31 59 26 59 C20 59 17 54 19 49 L23 41 C29 31 38 24 48 20 L55 9 L62 19 C75 27 81 46 77 62 C75 70 74 76 74 80 Z"/>
      <path class="s" d="M64 24 C73 33 77 48 73 62 C72 70 71 76 71 79 L64 79 C65 70 68 50 60 30 Z"/>
      <path class="o" d="M62 21 C70 30 73 44 70 58"/>
      <rect class="f" x="24" y="70" width="52" height="9" rx="4.5"/>
      <path class="feat" d="M37 35 Q42 28 48 34"/>
      <path class="mouth" d="M18.5 47 Q30 46 41 51 Q37 63 26 62 Q18.5 59 18.5 47 Z"/>
      <path class="teeth" d="M20 47.6 L38.5 50.4 L37.6 53.4 L20.2 51 Z"/>
      <path class="tongue" d="M24 58 Q30 54 36 57.5 Q33 62 27 61.5 Z"/>
      <circle class="d" cx="23" cy="43" r="2"/>
      <ellipse class="blush" cx="45" cy="44" rx="5" ry="3"/>
    </g>
  </g>
  ${drop(58, 40, 'jl1')}
  ${drop(58, 40, 'jl2')}
  ${drop(58, 40, 'jl3')}
  <text class="fx-text ha1" x="78" y="28">HA</text>
  <text class="fx-text ha2" x="90" y="52">HA</text>
  <text class="fx-text ha3" x="96" y="16">HA</text>`;

const CRY = `
  <g class="a-sob">
    ${KING_BODY}
    ${KING_CROWN}
    <path class="feat" d="M40 70 L53 65.5"/>
    <path class="feat" d="M80 70 L67 65.5"/>
    <path class="feat" d="M41 80 Q47 73 53 80"/>
    <path class="feat" d="M67 80 Q73 73 79 80"/>
    <g class="a-wail">
      <ellipse class="mouth" cx="60" cy="92" rx="10" ry="7"/>
      <path class="tongue" d="M52.5 95.5 Q60 90.5 67.5 95.5 Q60 99 52.5 95.5 Z"/>
    </g>
  </g>
  ${drop(46, 82, 'tl1')}${drop(46, 82, 'tl2')}${drop(46, 82, 'tl3')}
  ${drop(74, 82, 'tr1')}${drop(74, 82, 'tr2')}${drop(74, 82, 'tr3')}`;

const ROOK_BODY = 'M31 101 L34 50 L86 50 L89 101 Z';
const ROOK_TOP = 'M27 54 L27 22 L42 22 L42 32 L53 32 L53 22 L67 22 L67 32 L78 32 L78 22 L93 22 L93 54 Z';
const ANGRY = `
  <g class="a-shake">
    <rect class="f" x="24" y="100" width="72" height="13" rx="6.5"/>
    <path class="f" d="${ROOK_BODY}"/>
    <path class="s" d="M76 54 L84 54 L86.5 99 L79 99 Z"/>
    <path class="f" d="${ROOK_TOP}"/>
    <path class="flush" d="${ROOK_BODY}"/>
    <path class="flush" d="${ROOK_TOP}"/>
    <path class="brow" d="M39 61 L56 69"/>
    <path class="brow" d="M81 61 L64 69"/>
    <ellipse class="eye" cx="49" cy="75" rx="6.5" ry="5.5"/>
    <circle class="pupil" cx="51.5" cy="76" r="2.8"/>
    <ellipse class="eye" cx="71" cy="75" rx="6.5" ry="5.5"/>
    <circle class="pupil" cx="68.5" cy="76" r="2.8"/>
    <rect class="teeth" x="44" y="85" width="32" height="11" rx="3"/>
    <path class="o thin" d="M44 90.5 H76 M52 85 V96 M60 85 V96 M68 85 V96"/>
  </g>
  <circle class="puff p1" cx="24" cy="18" r="7"/>
  <circle class="puff p2" cx="97" cy="16" r="7"/>
  <circle class="puff p3" cx="34" cy="10" r="5"/>
  <circle class="puff p4" cx="86" cy="8" r="5"/>
  <g transform="translate(103 44)"><path class="vein" d="M-9 -3 Q-3 -3 -3 -9 M3 -9 Q3 -3 9 -3 M9 3 Q3 3 3 9 M-3 9 Q-3 3 -9 3"/></g>`;

const SHOCK = `
  <g class="a-startle">
    <rect class="f" x="26" y="100" width="68" height="13" rx="6.5"/>
    <path class="f" d="M30 102 C28 80 36 65 42 61 L78 61 C84 65 92 80 90 102 Z"/>
    <path class="s" d="M76 65 C84 73 88 87 87 100 L80 100 C81 87 79 75 74 65 Z"/>
    <rect class="f" x="37" y="54" width="46" height="10" rx="5"/>
    <path class="f" d="M38 57 L27 30 L41 42 L45 22 L54 38 L60 16 L66 38 L75 22 L79 42 L93 30 L82 57 Z"/>
    <circle class="f" cx="27" cy="28" r="4.5"/>
    <circle class="f" cx="45" cy="20" r="4.5"/>
    <circle class="f" cx="60" cy="13" r="4.5"/>
    <circle class="f" cx="75" cy="20" r="4.5"/>
    <circle class="f" cx="93" cy="28" r="4.5"/>
    <g class="a-eyepop">
      <circle class="eye" cx="49" cy="77" r="8.5"/>
      <circle class="pupil" cx="49" cy="77" r="2.6"/>
      <circle class="eye" cx="71" cy="77" r="8.5"/>
      <circle class="pupil" cx="71" cy="77" r="2.6"/>
    </g>
    <ellipse class="mouth" cx="60" cy="94" rx="5.5" ry="6"/>
  </g>
  <g class="excl-g">
    <path class="excl" d="M101 4 L109 4 L106.5 28 L103.5 28 Z"/>
    <circle class="excl" cx="105" cy="35" r="4"/>
  </g>
  ${drop(94, 70, 'sweat')}`;

const THINK = `
  <g class="a-tilt">
    <rect class="f" x="30" y="100" width="60" height="13" rx="6.5"/>
    <path class="f" d="M38 101 Q42 89 49 85 L71 85 Q78 89 82 101 Z"/>
    <rect class="f" x="41" y="78" width="38" height="10" rx="5"/>
    <path class="f" d="M60 16 C80 30 89 50 83 66 C78 78 42 78 37 66 C31 50 40 30 60 16 Z"/>
    <path class="s" d="M70 26 C80 38 85 52 81 64 C78 71 72 74 66 75 C74 66 77 46 70 26 Z"/>
    <circle class="f" cx="60" cy="11" r="6.5"/>
    <path class="o" d="M70 25 L60 36"/>
    <path class="feat" d="M44 46 Q50 40 57 44"/>
    <path class="feat" d="M64 48 L75 47"/>
    <circle class="eye" cx="51" cy="56" r="6"/>
    <circle class="pupil a-look" cx="53" cy="53.5" r="2.6"/>
    <circle class="eye" cx="69" cy="56" r="6"/>
    <circle class="pupil a-look" cx="71" cy="53.5" r="2.6"/>
    <path class="feat" d="M52 68 Q56 66 59 68 Q62 70 66 67"/>
    <circle class="glove" cx="72" cy="78" r="7"/>
    <rect class="glove" x="68.5" y="64" width="6" height="14" rx="3" transform="rotate(-18 71.5 71)"/>
  </g>
  <g class="thought">
    <circle class="bub b1" cx="88" cy="44" r="3.2"/>
    <circle class="bub b2" cx="96" cy="33" r="4.8"/>
    <g class="bub b3">
      <ellipse class="cloud" cx="102" cy="16" rx="14" ry="11"/>
      <text class="q" x="102" y="22">?</text>
    </g>
  </g>`;

const COOL = `
  <g class="a-nod">
    ${PAWN_BODY}
    <path class="feat" d="M49 58 Q62 64 72 53"/>
    <ellipse class="blush" cx="43" cy="55" rx="5" ry="3"/>
    <g class="a-shades">
      <path class="shades" d="M35 37 H58 V41 Q58 52 47 52 Q36 52 35.5 41 Z"/>
      <path class="shades" d="M62 37 H85 L84.5 41 Q84 52 73 52 Q62 52 62 41 Z"/>
      <path class="shades-bar" d="M31 38 H89"/>
      <path class="shine" d="M40 41 L45 46 M66 41 L71 46"/>
    </g>
  </g>
  ${star(80, 41, 9, 'spark glint')}`;

const SLEEP = `
  <g class="a-breathe">
    ${KING_BODY}
    <g class="crown-tilt">${KING_CROWN}</g>
    <path class="feat" d="M41 78 Q47 83 53 78"/>
    <path class="feat" d="M67 78 Q73 83 79 78"/>
    <ellipse class="mouth" cx="56" cy="93" rx="4" ry="3.5"/>
    <circle class="snot" cx="68" cy="90" r="6"/>
  </g>
  <text class="z z1" x="86" y="48">Z</text>
  <text class="z z2" x="97" y="33">Z</text>
  <text class="z z3" x="107" y="17">Z</text>`;

export const CHAR_EMOTES: CharEmote[] = [
  { id: 'thumbs', kind: 'char', label: 'Nice!', sound: 'thumbs', art: THUMBS },
  { id: 'laugh', kind: 'char', label: 'Hehehe', sound: 'laugh', art: LAUGH },
  { id: 'cry', kind: 'char', label: 'Waaah', sound: 'cry', art: CRY },
  { id: 'angry', kind: 'char', label: 'Grrr', sound: 'angry', art: ANGRY },
  { id: 'shock', kind: 'char', label: 'Whoa!', sound: 'shock', art: SHOCK },
  { id: 'think', kind: 'char', label: 'Hmm…', sound: 'think', art: THINK },
  { id: 'cool', kind: 'char', label: 'Too easy', sound: 'cool', art: COOL },
  { id: 'sleep', kind: 'char', label: 'Zzz', sound: 'sleep', art: SLEEP },
];

export const TEXT_EMOTES: TextEmote[] = [
  { id: 'gl', kind: 'text', text: 'Good luck!', sound: 'chat' },
  { id: 'wp', kind: 'text', text: 'Well played!', sound: 'chat' },
  { id: 'wow', kind: 'text', text: 'Wow!', sound: 'chat' },
  { id: 'ty', kind: 'text', text: 'Thanks!', sound: 'chat' },
  { id: 'oops', kind: 'text', text: 'Oops!', sound: 'chat' },
  { id: 'gg', kind: 'text', text: 'Good game!', sound: 'chat' },
];

const ALL = new Map<string, Emote>([...CHAR_EMOTES, ...TEXT_EMOTES].map((e) => [e.id, e]));

export function getEmote(id: string): Emote | undefined {
  return ALL.get(id);
}

export function emoteArtSvg(e: CharEmote, side: Side): string {
  return `<svg class="emote-art side-${side}" viewBox="0 0 120 120" aria-hidden="true">${e.art}</svg>`;
}
