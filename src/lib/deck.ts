// Card and deck utilities for poker

export const SUITS = ['h', 'd', 'c', 's'] as const;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;

export type Suit = typeof SUITS[number];
export type Rank = typeof RANKS[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type CardString = `${Rank}${Suit}`;

export function cardToString(card: Card): CardString {
  return `${card.rank}${card.suit}` as CardString;
}

export function stringToCard(str: string): Card {
  if (str.length !== 2) throw new Error(`Invalid card string: ${str}`);
  const rank = str[0].toUpperCase() as Rank;
  const suit = str[1].toLowerCase() as Suit;
  if (!RANKS.includes(rank)) throw new Error(`Invalid rank: ${rank}`);
  if (!SUITS.includes(suit)) throw new Error(`Invalid suit: ${suit}`);
  return { rank, suit };
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(deck: Card[], count: number): { dealt: Card[]; remaining: Card[] } {
  return {
    dealt: deck.slice(0, count),
    remaining: deck.slice(count),
  };
}

export function removeCards(deck: Card[], cardsToRemove: Card[]): Card[] {
  const removeSet = new Set(cardsToRemove.map(cardToString));
  return deck.filter(card => !removeSet.has(cardToString(card)));
}

export function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank);
}

export function compareRanks(a: Rank, b: Rank): number {
  return rankValue(a) - rankValue(b);
}

export function suitSymbol(suit: Suit): string {
  const symbols: Record<Suit, string> = {
    h: '♥',
    d: '♦',
    c: '♣',
    s: '♠',
  };
  return symbols[suit];
}

export function suitColor(suit: Suit): 'red' | 'black' {
  return suit === 'h' || suit === 'd' ? 'red' : 'black';
}

// Hand notation utilities (e.g., "AKs", "QQ", "T9o")
export type HandNotation = string;

export function isValidHandNotation(notation: string): boolean {
  if (notation.length < 2 || notation.length > 3) return false;
  const r1 = notation[0].toUpperCase() as Rank;
  const r2 = notation[1].toUpperCase() as Rank;
  if (!RANKS.includes(r1) || !RANKS.includes(r2)) return false;
  if (notation.length === 3) {
    const suffix = notation[2].toLowerCase();
    if (suffix !== 's' && suffix !== 'o') return false;
    if (r1 === r2) return false; // Pairs can't be suited/offsuit
  }
  return true;
}

export function handNotationToCategory(notation: string): 'pair' | 'suited' | 'offsuit' {
  const r1 = notation[0].toUpperCase();
  const r2 = notation[1].toUpperCase();
  if (r1 === r2) return 'pair';
  if (notation.length === 3 && notation[2].toLowerCase() === 's') return 'suited';
  return 'offsuit';
}

// Get all possible specific hands for a notation (e.g., "AKs" -> all suited AK combos)
export function expandHandNotation(notation: string): Card[][] {
  const r1 = notation[0].toUpperCase() as Rank;
  const r2 = notation[1].toUpperCase() as Rank;
  const combos: Card[][] = [];

  if (r1 === r2) {
    // Pairs: 6 combinations
    for (let i = 0; i < SUITS.length; i++) {
      for (let j = i + 1; j < SUITS.length; j++) {
        combos.push([
          { rank: r1, suit: SUITS[i] },
          { rank: r2, suit: SUITS[j] },
        ]);
      }
    }
  } else {
    const suited = notation.length === 3 && notation[2].toLowerCase() === 's';
    if (suited) {
      // Suited: 4 combinations
      for (const suit of SUITS) {
        combos.push([
          { rank: r1, suit },
          { rank: r2, suit },
        ]);
      }
    } else {
      // Offsuit: 12 combinations
      for (const s1 of SUITS) {
        for (const s2 of SUITS) {
          if (s1 !== s2) {
            combos.push([
              { rank: r1, suit: s1 },
              { rank: r2, suit: s2 },
            ]);
          }
        }
      }
    }
  }

  return combos;
}

// Convert two cards to hand notation
export function cardsToHandNotation(cards: [Card, Card]): HandNotation {
  const [c1, c2] = cards;
  const r1 = rankValue(c1.rank) >= rankValue(c2.rank) ? c1.rank : c2.rank;
  const r2 = rankValue(c1.rank) >= rankValue(c2.rank) ? c2.rank : c1.rank;

  if (r1 === r2) return `${r1}${r2}`;
  if (c1.suit === c2.suit) return `${r1}${r2}s`;
  return `${r1}${r2}o`;
}

// Generate a random hand from the deck
export function dealRandomHand(deck: Card[]): { hand: [Card, Card]; remaining: Card[] } {
  const shuffled = shuffleDeck(deck);
  return {
    hand: [shuffled[0], shuffled[1]] as [Card, Card],
    remaining: shuffled.slice(2),
  };
}
