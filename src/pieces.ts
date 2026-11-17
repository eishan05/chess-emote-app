/**
 * Original cartoon chess piece art, drawn on a 100x100 grid.
 * Classes: `f` = main fill, `s` = shade fill, `o` = outline-only detail, `d` = dark detail fill.
 * Colours come from CSS (`.pc-w` / `.pc-b`) so the same markup serves both sides.
 */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Side = 'w' | 'b';

const BASE_WIDE = '<rect class="f" x="17" y="79" width="66" height="12" rx="6"/>';

const ART: Record<PieceType, string> = {
  p: `
    <rect class="f" x="22" y="79" width="56" height="12" rx="6"/>
    <path class="f" d="M29 80 Q31 62 41 55 L59 55 Q69 62 71 80 Z"/>
    <path class="s" d="M58 58 Q66 64 67 78 L60 78 Q60 66 55 58 Z"/>
    <rect class="f" x="34" y="49" width="32" height="9" rx="4.5"/>
    <circle class="f" cx="50" cy="33" r="16"/>
    <path class="s" d="M58 22 A13 13 0 0 1 56 46 A16 16 0 0 0 58 22 Z"/>
    <circle class="hl" cx="44" cy="27" r="4"/>`,
  r: `
    ${BASE_WIDE}
    <path class="f" d="M28 80 L32 42 L68 42 L72 80 Z"/>
    <path class="s" d="M60 44 L66 44 L69 78 L62 78 Z"/>
    <rect class="f" x="25" y="68" width="50" height="9" rx="4"/>
    <path class="f" d="M23 44 L23 18 L35 18 L35 27 L44 27 L44 18 L56 18 L56 27 L65 27 L65 18 L77 18 L77 44 Z"/>
    <rect class="hl" x="28" y="22" width="4" height="14" rx="2"/>`,
  b: `
    ${BASE_WIDE}
    <path class="f" d="M31 80 Q35 67 42 62 L58 62 Q65 67 69 80 Z"/>
    <rect class="f" x="33" y="56" width="34" height="9" rx="4.5"/>
    <path class="f" d="M50 17 C63 27 69 39 65 50 C61 59 39 59 35 50 C31 39 37 27 50 17 Z"/>
    <path class="s" d="M57 25 C64 33 66 42 63 50 C61 54 56 56 52 56 C58 50 61 40 57 25 Z"/>
    <path class="o" d="M57 30 L46 42"/>
    <circle class="f" cx="50" cy="12" r="6"/>
    <circle class="hl" cx="43" cy="33" r="3.5"/>`,
  n: `
    ${BASE_WIDE}
    <path class="f" d="M30 80 C30 70 34 62 43 55 C37 57 31 59 26 59 C20 59 17 54 19 49 L23 41 C29 31 38 24 48 20 L55 9 L62 19 C75 27 81 46 77 62 C75 70 74 76 74 80 Z"/>
    <path class="s" d="M64 24 C73 33 77 48 73 62 C72 70 71 76 71 79 L64 79 C65 70 68 50 60 30 Z"/>
    <path class="o" d="M62 21 C70 30 73 44 70 58"/>
    <circle class="d" cx="43" cy="33" r="3.6"/>
    <circle class="d" cx="25" cy="50" r="2.2"/>
    <rect class="f" x="24" y="70" width="52" height="9" rx="4.5"/>`,
  q: `
    ${BASE_WIDE}
    <path class="f" d="M28 80 Q34 63 36 52 L64 52 Q66 63 72 80 Z"/>
    <path class="s" d="M58 54 L63 54 Q65 66 69 78 L62 78 Q60 66 58 54 Z"/>
    <rect class="f" x="31" y="46" width="38" height="9" rx="4.5"/>
    <path class="f" d="M31 48 L21 24 L33 35 L36 19 L44 32 L50 13 L56 32 L64 19 L67 35 L79 24 L69 48 Z"/>
    <circle class="f" cx="21" cy="22" r="4.5"/>
    <circle class="f" cx="36" cy="17" r="4.5"/>
    <circle class="f" cx="50" cy="11" r="4.5"/>
    <circle class="f" cx="64" cy="17" r="4.5"/>
    <circle class="f" cx="79" cy="22" r="4.5"/>`,
  k: `
    ${BASE_WIDE}
    <path class="f" d="M28 80 Q34 63 36 52 L64 52 Q66 63 72 80 Z"/>
    <path class="s" d="M58 54 L63 54 Q65 66 69 78 L62 78 Q60 66 58 54 Z"/>
    <rect class="f" x="31" y="46" width="38" height="9" rx="4.5"/>
    <path class="f" d="M33 48 C25 37 28 25 39 27 C44 28 48 31 50 35 C52 31 56 28 61 27 C72 25 75 37 67 48 Z"/>
    <rect class="f" x="46" y="6" width="8" height="26" rx="2.5"/>
    <rect class="f" x="40" y="12" width="20" height="8" rx="2.5"/>`,
};

export function pieceSvg(type: PieceType, side: Side): string {
  return `<svg class="piece-svg pc-${side}" viewBox="0 0 100 100" aria-hidden="true">${ART[type]}</svg>`;
}

export const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const PIECE_NAME: Record<PieceType, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
