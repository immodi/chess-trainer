/** Theme names and the "what to look for" text shown by the tactics trainer (SPEC 7.2). */
export interface ThemeInfo {
  id: string;
  name: string;
  lookFor: string;
}

export const THEMES: readonly ThemeInfo[] = [
  {
    id: 'hangingPiece',
    name: 'Hanging piece',
    lookFor:
      'A piece that can be captured for free. Before every move, scan both sides: which pieces are undefended, or attacked by something worth less?',
  },
  {
    id: 'fork',
    name: 'Fork',
    lookFor:
      'One piece attacks two valuable things at once. Knights are the classic forkers. Look for a square where your piece would attack two or more undefended or higher-value pieces.',
  },
  {
    id: 'pin',
    name: 'Pin',
    lookFor:
      "A piece can't (or shouldn't) move because something more valuable sits behind it on the same line. Look for bishops, rooks and queens aiming along a line at a piece with the king or queen behind it.",
  },
  {
    id: 'skewer',
    name: 'Skewer',
    lookFor:
      'A pin in reverse: a valuable piece is attacked, must move, and exposes the piece behind it. Look for checks or attacks on a king or queen with something loose behind it.',
  },
  {
    id: 'backRankMate',
    name: 'Back-rank mate',
    lookFor:
      "The king is trapped on its back rank by its own pawns and a rook or queen gives check along the rank. Check whether your own king has an escape square, and look for enemy kings that don't.",
  },
  {
    id: 'discoveredAttack',
    name: 'Discovered attack',
    lookFor:
      'Moving one piece uncovers an attack from the piece behind it. The moving piece can make its own threat at the same time.',
  },
  {
    id: 'mateIn1',
    name: 'Mate in one',
    lookFor:
      'List every check first. A check where the king has no escape, no block and no capture is mate.',
  },
  {
    id: 'mateIn2',
    name: 'Mate in two',
    lookFor:
      'List every check first. If the first check can be answered, look for the follow-up check that leaves no escape.',
  },
  {
    id: 'trappedPiece',
    name: 'Trapped piece',
    lookFor:
      'An attacked piece with no safe square to go to. Count the safe retreats of an enemy piece that has wandered far.',
  },
  {
    id: 'deflection',
    name: 'Deflection',
    lookFor:
      'Force a defender away from its job (guarding a piece or a mating square), then take what it was guarding.',
  },
  {
    id: 'attraction',
    name: 'Attraction',
    lookFor:
      'Lure an enemy piece, often the king, onto a bad square, usually with a sacrifice, so you can attack it.',
  },
  {
    id: 'capturingDefender',
    name: 'Capturing the defender',
    lookFor:
      'Capture the piece that defends your real target, then take the target.',
  },
];

const BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]));

export function themeInfo(id: string): ThemeInfo | undefined {
  return BY_ID.get(id);
}

export function themeName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}
