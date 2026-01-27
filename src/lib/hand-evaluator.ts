// Hand evaluation for Texas Hold'em
import { Card, Rank, RANKS, rankValue } from './deck';

export enum HandRank {
  HIGH_CARD = 0,
  ONE_PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_A_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_A_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9,
}

export const HAND_RANK_NAMES: Record<HandRank, string> = {
  [HandRank.HIGH_CARD]: 'High Card',
  [HandRank.ONE_PAIR]: 'One Pair',
  [HandRank.TWO_PAIR]: 'Two Pair',
  [HandRank.THREE_OF_A_KIND]: 'Three of a Kind',
  [HandRank.STRAIGHT]: 'Straight',
  [HandRank.FLUSH]: 'Flush',
  [HandRank.FULL_HOUSE]: 'Full House',
  [HandRank.FOUR_OF_A_KIND]: 'Four of a Kind',
  [HandRank.STRAIGHT_FLUSH]: 'Straight Flush',
  [HandRank.ROYAL_FLUSH]: 'Royal Flush',
};

export interface EvaluatedHand {
  rank: HandRank;
  rankName: string;
  cards: Card[]; // The 5 cards that make up the hand
  kickers: Rank[]; // Ranks used for tie-breaking, in order of importance
  score: number; // Numeric score for comparison
}

// Get rank counts for a set of cards
function getRankCounts(cards: Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
  }
  return counts;
}

// Get suit counts for a set of cards
function getSuitCounts(cards: Card[]): Map<string, Card[]> {
  const suits = new Map<string, Card[]>();
  for (const card of cards) {
    if (!suits.has(card.suit)) suits.set(card.suit, []);
    suits.get(card.suit)!.push(card);
  }
  return suits;
}

// Check for straight, returns the high card of the straight or null
function findStraight(cards: Card[]): Rank | null {
  const ranks = [...new Set(cards.map(c => rankValue(c.rank)))].sort((a, b) => b - a);

  // Check for regular straights
  for (let i = 0; i <= ranks.length - 5; i++) {
    let isStraight = true;
    for (let j = 0; j < 4; j++) {
      if (ranks[i + j] - ranks[i + j + 1] !== 1) {
        isStraight = false;
        break;
      }
    }
    if (isStraight) {
      return RANKS[ranks[i]];
    }
  }

  // Check for wheel (A-2-3-4-5)
  const hasAce = ranks.includes(12);
  const hasWheel = [0, 1, 2, 3].every(r => ranks.includes(r));
  if (hasAce && hasWheel) {
    return '5' as Rank; // 5-high straight
  }

  return null;
}

// Find flush cards (5+ cards of same suit)
function findFlush(cards: Card[]): Card[] | null {
  const suits = getSuitCounts(cards);
  for (const [, suitCards] of suits) {
    if (suitCards.length >= 5) {
      return suitCards.sort((a, b) => rankValue(b.rank) - rankValue(a.rank)).slice(0, 5);
    }
  }
  return null;
}

// Calculate a numeric score for comparing hands
function calculateScore(handRank: HandRank, kickers: Rank[]): number {
  // Score = handRank * 15^5 + kicker1 * 15^4 + kicker2 * 15^3 + ...
  let score = handRank * Math.pow(15, 5);
  for (let i = 0; i < kickers.length && i < 5; i++) {
    score += rankValue(kickers[i]) * Math.pow(15, 4 - i);
  }
  return score;
}

// Get the best 5-card hand from 5-7 cards
export function evaluateHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error('Must provide 5-7 cards');
  }

  // If more than 5 cards, find best 5-card combination
  if (cards.length > 5) {
    let bestHand: EvaluatedHand | null = null;
    const combinations = getCombinations(cards, 5);

    for (const combo of combinations) {
      const hand = evaluateFiveCards(combo);
      if (!bestHand || hand.score > bestHand.score) {
        bestHand = hand;
      }
    }

    return bestHand!;
  }

  return evaluateFiveCards(cards);
}

// Evaluate exactly 5 cards
function evaluateFiveCards(cards: Card[]): EvaluatedHand {
  const rankCounts = getRankCounts(cards);
  const sortedByCount = [...rankCounts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]; // By count first
      return rankValue(b[0]) - rankValue(a[0]); // Then by rank
    });

  const isFlush = new Set(cards.map(c => c.suit)).size === 1;
  const straightHigh = findStraight(cards);
  const isStraight = straightHigh !== null;

  // Straight flush / Royal flush
  if (isFlush && isStraight) {
    const kickers = [straightHigh!];
    const rank = straightHigh === 'A' ? HandRank.ROYAL_FLUSH : HandRank.STRAIGHT_FLUSH;
    return {
      rank,
      rankName: HAND_RANK_NAMES[rank],
      cards,
      kickers,
      score: calculateScore(rank, kickers),
    };
  }

  // Four of a kind
  if (sortedByCount[0][1] === 4) {
    const quadRank = sortedByCount[0][0];
    const kicker = sortedByCount[1][0];
    return {
      rank: HandRank.FOUR_OF_A_KIND,
      rankName: HAND_RANK_NAMES[HandRank.FOUR_OF_A_KIND],
      cards,
      kickers: [quadRank, kicker],
      score: calculateScore(HandRank.FOUR_OF_A_KIND, [quadRank, kicker]),
    };
  }

  // Full house
  if (sortedByCount[0][1] === 3 && sortedByCount[1][1] === 2) {
    const tripRank = sortedByCount[0][0];
    const pairRank = sortedByCount[1][0];
    return {
      rank: HandRank.FULL_HOUSE,
      rankName: HAND_RANK_NAMES[HandRank.FULL_HOUSE],
      cards,
      kickers: [tripRank, pairRank],
      score: calculateScore(HandRank.FULL_HOUSE, [tripRank, pairRank]),
    };
  }

  // Flush
  if (isFlush) {
    const kickers = cards
      .map(c => c.rank)
      .sort((a, b) => rankValue(b) - rankValue(a));
    return {
      rank: HandRank.FLUSH,
      rankName: HAND_RANK_NAMES[HandRank.FLUSH],
      cards,
      kickers,
      score: calculateScore(HandRank.FLUSH, kickers),
    };
  }

  // Straight
  if (isStraight) {
    return {
      rank: HandRank.STRAIGHT,
      rankName: HAND_RANK_NAMES[HandRank.STRAIGHT],
      cards,
      kickers: [straightHigh!],
      score: calculateScore(HandRank.STRAIGHT, [straightHigh!]),
    };
  }

  // Three of a kind
  if (sortedByCount[0][1] === 3) {
    const tripRank = sortedByCount[0][0];
    const kickers = [tripRank, sortedByCount[1][0], sortedByCount[2][0]];
    return {
      rank: HandRank.THREE_OF_A_KIND,
      rankName: HAND_RANK_NAMES[HandRank.THREE_OF_A_KIND],
      cards,
      kickers,
      score: calculateScore(HandRank.THREE_OF_A_KIND, kickers),
    };
  }

  // Two pair
  if (sortedByCount[0][1] === 2 && sortedByCount[1][1] === 2) {
    const highPair = sortedByCount[0][0];
    const lowPair = sortedByCount[1][0];
    const kicker = sortedByCount[2][0];
    return {
      rank: HandRank.TWO_PAIR,
      rankName: HAND_RANK_NAMES[HandRank.TWO_PAIR],
      cards,
      kickers: [highPair, lowPair, kicker],
      score: calculateScore(HandRank.TWO_PAIR, [highPair, lowPair, kicker]),
    };
  }

  // One pair
  if (sortedByCount[0][1] === 2) {
    const pairRank = sortedByCount[0][0];
    const kickers = [pairRank, sortedByCount[1][0], sortedByCount[2][0], sortedByCount[3][0]];
    return {
      rank: HandRank.ONE_PAIR,
      rankName: HAND_RANK_NAMES[HandRank.ONE_PAIR],
      cards,
      kickers,
      score: calculateScore(HandRank.ONE_PAIR, kickers),
    };
  }

  // High card
  const kickers = cards
    .map(c => c.rank)
    .sort((a, b) => rankValue(b) - rankValue(a));
  return {
    rank: HandRank.HIGH_CARD,
    rankName: HAND_RANK_NAMES[HandRank.HIGH_CARD],
    cards,
    kickers,
    score: calculateScore(HandRank.HIGH_CARD, kickers),
  };
}

// Generate all combinations of k elements from array
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];

  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(combo => [first, ...combo]);
  const withoutFirst = getCombinations(rest, k);

  return [...withFirst, ...withoutFirst];
}

// Compare two evaluated hands, returns positive if hand1 wins, negative if hand2 wins, 0 for tie
export function compareHands(hand1: EvaluatedHand, hand2: EvaluatedHand): number {
  return hand1.score - hand2.score;
}

// Determine the winner between multiple hands
export function findWinners(hands: EvaluatedHand[]): number[] {
  if (hands.length === 0) return [];

  let maxScore = -Infinity;
  const winners: number[] = [];

  for (let i = 0; i < hands.length; i++) {
    if (hands[i].score > maxScore) {
      maxScore = hands[i].score;
      winners.length = 0;
      winners.push(i);
    } else if (hands[i].score === maxScore) {
      winners.push(i);
    }
  }

  return winners;
}

// Get the nuts (best possible hand) given a board
export function findNuts(board: Card[]): { hand: [Card, Card]; evaluated: EvaluatedHand } | null {
  if (board.length < 3) return null;

  // Generate all possible hole cards from remaining deck
  const usedCards = new Set(board.map(c => `${c.rank}${c.suit}`));
  const remainingCards: Card[] = [];

  for (const suit of ['h', 'd', 'c', 's'] as const) {
    for (const rank of RANKS) {
      if (!usedCards.has(`${rank}${suit}`)) {
        remainingCards.push({ rank, suit });
      }
    }
  }

  let bestHand: EvaluatedHand | null = null;
  let bestHoleCards: [Card, Card] | null = null;

  // Try all possible hole card combinations
  for (let i = 0; i < remainingCards.length; i++) {
    for (let j = i + 1; j < remainingCards.length; j++) {
      const holeCards: [Card, Card] = [remainingCards[i], remainingCards[j]];
      const allCards = [...holeCards, ...board];
      const evaluated = evaluateHand(allCards);

      if (!bestHand || evaluated.score > bestHand.score) {
        bestHand = evaluated;
        bestHoleCards = holeCards;
      }
    }
  }

  return bestHoleCards && bestHand ? { hand: bestHoleCards, evaluated: bestHand } : null;
}

// Count possible flush draws on the board
export function countFlushDraws(board: Card[]): number {
  const suitCounts = new Map<string, number>();
  for (const card of board) {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
  }

  let draws = 0;
  for (const [, count] of suitCounts) {
    if (count >= 2) draws++; // Two+ of same suit = potential flush draw
  }
  return draws;
}

// Check if board is paired
export function isBoardPaired(board: Card[]): boolean {
  const rankCounts = getRankCounts(board);
  for (const [, count] of rankCounts) {
    if (count >= 2) return true;
  }
  return false;
}

// Check if there are possible straights on board
export function hasStraightPossibility(board: Card[]): boolean {
  const ranks = [...new Set(board.map(c => rankValue(c.rank)))].sort((a, b) => a - b);

  // Check if any 3 cards are within 4 ranks of each other
  for (let i = 0; i < ranks.length; i++) {
    for (let j = i; j < ranks.length; j++) {
      if (ranks[j] - ranks[i] <= 4) {
        return true;
      }
    }
  }

  return false;
}
