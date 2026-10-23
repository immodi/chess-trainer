/** Short, beginner-friendly definitions used by feedback and the Glossary screen. */
export interface GlossaryTerm {
  id: string;
  name: string;
  definition: string;
}

export const GLOSSARY: readonly GlossaryTerm[] = [
  {
    id: 'hanging',
    name: 'Hanging piece',
    definition:
      'A piece you can win for free: it is attacked and either undefended or not defended enough.',
  },
  {
    id: 'defended',
    name: 'Defended',
    definition:
      'Another piece of the same colour guards it, so capturing it means the attacker can be captured back.',
  },
  {
    id: 'fork',
    name: 'Fork',
    definition:
      'One piece attacks two or more valuable targets at once. Knights fork most often because their attacks are hard to see.',
  },
  {
    id: 'pin',
    name: 'Pin',
    definition:
      'A piece cannot move without exposing something more valuable behind it on the same line. If the king is behind it, the pin is absolute.',
  },
  {
    id: 'skewer',
    name: 'Skewer',
    definition:
      'The reverse of a pin: a valuable piece is attacked and must move, exposing a lesser piece behind it.',
  },
  {
    id: 'back-rank',
    name: 'Back rank',
    definition:
      'The rank where the king starts. If its own pawns block every escape square ("no luft"), an enemy rook or queen can mate along that rank.',
  },
  {
    id: 'luft',
    name: 'Luft',
    definition: 'A small escape square for the king, usually made by moving a pawn in front of it.',
  },
  {
    id: 'discovered',
    name: 'Discovered attack',
    definition:
      'Moving one piece uncovers an attack from a bishop, rook or queen that was hidden behind it.',
  },
  {
    id: 'threat',
    name: 'Threat',
    definition:
      'What the opponent could do if it were their turn right now: a capture, a check, or mate.',
  },
  {
    id: 'inaccuracy',
    name: 'Inaccuracy, mistake, blunder',
    definition:
      'How much a move gives away, in winning chances: an inaccuracy a little, a mistake more, a blunder a lot. The app uses the engine to measure it.',
  },
];

export function glossaryTerm(id: string): GlossaryTerm | undefined {
  return GLOSSARY.find((term) => term.id === id);
}
