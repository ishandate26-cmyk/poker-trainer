// Monte Carlo equity calculator for Texas Hold'em
import { Card, createDeck, removeCards, shuffleDeck, expandHandNotation } from './deck';
import { evaluateHand, compareHands } from './hand-evaluator';

export interface EquityResult {
  equity: number; // 0-100
  wins: number;
  ties: number;
  losses: number;
  simulations: number;
}

export interface RangeEquityResult extends EquityResult {
  rangeSize: number; // Number of combos in opponent's range
}

// Calculate equity of a hand against another specific hand
export function calculateHeadsUpEquity(
  hand1: [Card, Card],
  hand2: [Card, Card],
  board: Card[] = [],
  simulations: number = 10000
): EquityResult {
  let wins = 0;
  let ties = 0;
  let losses = 0;

  const deadCards = [...hand1, ...hand2, ...board];
  const remainingDeck = removeCards(createDeck(), deadCards);
  const cardsNeeded = 5 - board.length;

  for (let i = 0; i < simulations; i++) {
    const shuffled = shuffleDeck(remainingDeck);
    const runout = [...board, ...shuffled.slice(0, cardsNeeded)];

    const eval1 = evaluateHand([...hand1, ...runout]);
    const eval2 = evaluateHand([...hand2, ...runout]);

    const comparison = compareHands(eval1, eval2);

    if (comparison > 0) wins++;
    else if (comparison < 0) losses++;
    else ties++;
  }

  return {
    equity: ((wins + ties / 2) / simulations) * 100,
    wins,
    ties,
    losses,
    simulations,
  };
}

// Calculate equity of a hand against a range of hands
export function calculateEquityVsRange(
  hand: [Card, Card],
  range: string[], // Array of hand notations like ["AA", "KK", "AKs"]
  board: Card[] = [],
  simulationsPerCombo: number = 100
): RangeEquityResult {
  let totalWins = 0;
  let totalTies = 0;
  let totalLosses = 0;
  let totalSimulations = 0;
  let rangeSize = 0;

  const handSet = new Set([`${hand[0].rank}${hand[0].suit}`, `${hand[1].rank}${hand[1].suit}`]);
  const boardSet = new Set(board.map(c => `${c.rank}${c.suit}`));

  for (const notation of range) {
    const combos = expandHandNotation(notation);

    for (const combo of combos) {
      // Skip combos that overlap with hero's hand or board
      const comboCards = combo.map(c => `${c.rank}${c.suit}`);
      if (comboCards.some(c => handSet.has(c) || boardSet.has(c))) {
        continue;
      }

      rangeSize++;

      const result = calculateHeadsUpEquity(
        hand,
        combo as [Card, Card],
        board,
        simulationsPerCombo
      );

      totalWins += result.wins;
      totalTies += result.ties;
      totalLosses += result.losses;
      totalSimulations += result.simulations;
    }
  }

  if (totalSimulations === 0) {
    return {
      equity: 0,
      wins: 0,
      ties: 0,
      losses: 0,
      simulations: 0,
      rangeSize: 0,
    };
  }

  return {
    equity: ((totalWins + totalTies / 2) / totalSimulations) * 100,
    wins: totalWins,
    ties: totalTies,
    losses: totalLosses,
    simulations: totalSimulations,
    rangeSize,
  };
}

// Faster equity calculation with sampling from range
export function calculateEquityVsRangeFast(
  hand: [Card, Card],
  range: string[],
  board: Card[] = [],
  totalSimulations: number = 5000
): RangeEquityResult {
  // Expand all combos in range
  const allCombos: [Card, Card][] = [];
  const handSet = new Set([`${hand[0].rank}${hand[0].suit}`, `${hand[1].rank}${hand[1].suit}`]);
  const boardSet = new Set(board.map(c => `${c.rank}${c.suit}`));

  for (const notation of range) {
    const combos = expandHandNotation(notation);
    for (const combo of combos) {
      const comboCards = combo.map(c => `${c.rank}${c.suit}`);
      if (!comboCards.some(c => handSet.has(c) || boardSet.has(c))) {
        allCombos.push(combo as [Card, Card]);
      }
    }
  }

  if (allCombos.length === 0) {
    return {
      equity: 0,
      wins: 0,
      ties: 0,
      losses: 0,
      simulations: 0,
      rangeSize: 0,
    };
  }

  let wins = 0;
  let ties = 0;
  let losses = 0;

  for (let i = 0; i < totalSimulations; i++) {
    // Randomly select a combo from the range
    const opponentHand = allCombos[Math.floor(Math.random() * allCombos.length)];

    // Deal out the remaining board
    const deadCards = [...hand, ...opponentHand, ...board];
    const remainingDeck = removeCards(createDeck(), deadCards);
    const shuffled = shuffleDeck(remainingDeck);
    const cardsNeeded = 5 - board.length;
    const runout = [...board, ...shuffled.slice(0, cardsNeeded)];

    // Evaluate both hands
    const eval1 = evaluateHand([...hand, ...runout]);
    const eval2 = evaluateHand([...opponentHand, ...runout]);

    const comparison = compareHands(eval1, eval2);

    if (comparison > 0) wins++;
    else if (comparison < 0) losses++;
    else ties++;
  }

  return {
    equity: ((wins + ties / 2) / totalSimulations) * 100,
    wins,
    ties,
    losses,
    simulations: totalSimulations,
    rangeSize: allCombos.length,
  };
}

// Common preflop equity scenarios for quick reference
export const COMMON_EQUITIES: Record<string, number> = {
  // Pair vs pair
  'AA_vs_KK': 81.95,
  'KK_vs_QQ': 81.46,
  'AA_vs_22': 83.32,

  // Pair vs suited connectors
  'AA_vs_87s': 77.28,
  'KK_vs_JTs': 77.97,

  // Pair vs overcards
  'JJ_vs_AKs': 54.26,
  'JJ_vs_AKo': 57.02,
  '22_vs_AKs': 48.19,

  // Dominated hands
  'AKs_vs_AQs': 69.95,
  'AKo_vs_AQo': 73.51,
  'KQ_vs_K8': 71.35,

  // Coin flips
  'AKs_vs_QQ': 45.74,
  'AKo_vs_JJ': 43.38,

  // Suited vs unsuited
  'AKs_vs_AKo': 52.24,
};

// Generate a random preflop scenario for training
export function generatePreflopScenario(): {
  heroHand: [Card, Card];
  villainRange: string[];
  board: Card[];
} {
  const deck = shuffleDeck(createDeck());
  const heroHand: [Card, Card] = [deck[0], deck[1]];

  // Generate a realistic villain range
  const ranges = [
    // Tight range (top 10%)
    ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs'],
    // Medium range (top 20%)
    ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'KQs', 'KQo'],
    // Wide range (top 30%)
    ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'AJo', 'ATs', 'KQs', 'KQo', 'KJs', 'QJs', 'JTs'],
  ];

  const villainRange = ranges[Math.floor(Math.random() * ranges.length)];

  return { heroHand, villainRange, board: [] };
}

// Generate a flop scenario
export function generateFlopScenario(): {
  heroHand: [Card, Card];
  villainRange: string[];
  board: Card[];
} {
  const base = generatePreflopScenario();
  const deadCards = [...base.heroHand];
  const remainingDeck = removeCards(createDeck(), deadCards);
  const shuffled = shuffleDeck(remainingDeck);

  return {
    ...base,
    board: shuffled.slice(0, 3),
  };
}

// Generate a turn scenario
export function generateTurnScenario(): {
  heroHand: [Card, Card];
  villainRange: string[];
  board: Card[];
} {
  const base = generatePreflopScenario();
  const deadCards = [...base.heroHand];
  const remainingDeck = removeCards(createDeck(), deadCards);
  const shuffled = shuffleDeck(remainingDeck);

  return {
    ...base,
    board: shuffled.slice(0, 4),
  };
}

// Generate a river scenario
export function generateRiverScenario(): {
  heroHand: [Card, Card];
  villainRange: string[];
  board: Card[];
} {
  const base = generatePreflopScenario();
  const deadCards = [...base.heroHand];
  const remainingDeck = removeCards(createDeck(), deadCards);
  const shuffled = shuffleDeck(remainingDeck);

  return {
    ...base,
    board: shuffled.slice(0, 5),
  };
}
