// GTO preflop ranges for different positions
// Based on simplified 6-max cash game strategy

export type Position = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

export type Action = 'fold' | 'open' | 'call' | '3bet';

export const POSITIONS: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

export const POSITION_NAMES: Record<Position, string> = {
  UTG: 'Under the Gun',
  HJ: 'Hijack',
  CO: 'Cutoff',
  BTN: 'Button',
  SB: 'Small Blind',
  BB: 'Big Blind',
};

// All possible hand notations in standard order
export const ALL_HANDS: string[] = [];

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Generate all hands
for (let i = 0; i < RANKS.length; i++) {
  for (let j = 0; j < RANKS.length; j++) {
    if (i === j) {
      ALL_HANDS.push(`${RANKS[i]}${RANKS[j]}`); // Pair
    } else if (i < j) {
      ALL_HANDS.push(`${RANKS[i]}${RANKS[j]}s`); // Suited (above diagonal)
    } else {
      ALL_HANDS.push(`${RANKS[j]}${RANKS[i]}o`); // Offsuit (below diagonal)
    }
  }
}

// Opening ranges by position (RFI - Raise First In)
export const OPENING_RANGES: Record<Position, string[]> = {
  UTG: [
    // ~15% of hands
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77',
    'AKs', 'AQs', 'AJs', 'ATs', 'A5s', 'A4s',
    'KQs', 'KJs', 'KTs',
    'QJs', 'QTs',
    'JTs',
    'T9s',
    '98s',
    'AKo', 'AQo', 'AJo',
    'KQo',
  ],
  HJ: [
    // ~18% of hands
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A5s', 'A4s', 'A3s',
    'KQs', 'KJs', 'KTs', 'K9s',
    'QJs', 'QTs', 'Q9s',
    'JTs', 'J9s',
    'T9s', 'T8s',
    '98s', '97s',
    '87s',
    '76s',
    'AKo', 'AQo', 'AJo', 'ATo',
    'KQo', 'KJo',
    'QJo',
  ],
  CO: [
    // ~25% of hands
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'K9s', 'K8s',
    'QJs', 'QTs', 'Q9s', 'Q8s',
    'JTs', 'J9s', 'J8s',
    'T9s', 'T8s',
    '98s', '97s',
    '87s', '86s',
    '76s', '75s',
    '65s', '64s',
    '54s',
    'AKo', 'AQo', 'AJo', 'ATo', 'A9o',
    'KQo', 'KJo', 'KTo',
    'QJo', 'QTo',
    'JTo',
  ],
  BTN: [
    // ~40% of hands
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s',
    'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s',
    'JTs', 'J9s', 'J8s', 'J7s',
    'T9s', 'T8s', 'T7s',
    '98s', '97s', '96s',
    '87s', '86s', '85s',
    '76s', '75s', '74s',
    '65s', '64s',
    '54s', '53s',
    '43s',
    'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
    'KQo', 'KJo', 'KTo', 'K9o', 'K8o',
    'QJo', 'QTo', 'Q9o',
    'JTo', 'J9o',
    'T9o', 'T8o',
    '98o',
    '87o',
  ],
  SB: [
    // ~35% of hands (typically 3bet or fold vs open, but for RFI similar to BTN)
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s',
    'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s',
    'JTs', 'J9s', 'J8s', 'J7s',
    'T9s', 'T8s', 'T7s',
    '98s', '97s',
    '87s', '86s',
    '76s', '75s',
    '65s', '64s',
    '54s',
    'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A5o', 'A4o',
    'KQo', 'KJo', 'KTo', 'K9o',
    'QJo', 'QTo',
    'JTo', 'J9o',
    'T9o',
    '98o',
  ],
  BB: [
    // BB defends wide vs raises, but for opening when SB limps: wide
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
    'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s',
    'JTs', 'J9s', 'J8s', 'J7s', 'J6s',
    'T9s', 'T8s', 'T7s', 'T6s',
    '98s', '97s', '96s',
    '87s', '86s', '85s',
    '76s', '75s',
    '65s', '64s',
    '54s', '53s',
    '43s',
    'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
    'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o',
    'QJo', 'QTo', 'Q9o', 'Q8o',
    'JTo', 'J9o', 'J8o',
    'T9o', 'T8o',
    '98o', '97o',
    '87o', '86o',
    '76o',
    '65o',
  ],
};

// 3-bet ranges by position vs different openers
export const THREE_BET_RANGES: Record<Position, Record<Position, string[]>> = {
  UTG: {
    UTG: [], HJ: [], CO: [], BTN: [], SB: [], BB: [],
  },
  HJ: {
    UTG: ['AA', 'KK', 'QQ', 'AKs', 'AKo'],
    HJ: [], CO: [], BTN: [], SB: [], BB: [],
  },
  CO: {
    UTG: ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs'],
    HJ: ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs', 'AJs'],
    CO: [], BTN: [], SB: [], BB: [],
  },
  BTN: {
    UTG: ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs', 'AJs'],
    HJ: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'KQs'],
    CO: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'KQs', 'KJs', 'A5s', 'A4s'],
    BTN: [], SB: [], BB: [],
  },
  SB: {
    UTG: ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs'],
    HJ: ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs', 'AJs', 'KQs'],
    CO: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'KQs', 'KJs', 'A5s'],
    BTN: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'AJo', 'ATs', 'A9s', 'KQs', 'KQo', 'KJs', 'KTs', 'QJs', 'A5s', 'A4s'],
    SB: [], BB: [],
  },
  BB: {
    UTG: ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo'],
    HJ: ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs'],
    CO: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'KQs'],
    BTN: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'AJo', 'ATs', 'KQs', 'KQo', 'KJs', 'A5s', 'A4s', 'A3s'],
    SB: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'AJo', 'ATs', 'ATo', 'A9s', 'KQs', 'KQo', 'KJs', 'KJo', 'KTs', 'QJs', 'QTs', 'JTs', 'A5s', 'A4s', 'A3s', 'A2s'],
    BB: [],
  },
};

// Get correct action for a hand in a position
export function getCorrectAction(hand: string, position: Position, facing: 'open' | 'vs_raise' = 'open', raiserPosition?: Position): Action {
  if (facing === 'open') {
    if (OPENING_RANGES[position].includes(hand)) {
      return 'open';
    }
    return 'fold';
  }

  // Facing a raise
  if (raiserPosition && THREE_BET_RANGES[position]?.[raiserPosition]?.includes(hand)) {
    return '3bet';
  }

  // Check if in calling range (simplified - hands in opening range but not 3bet range)
  // This is simplified; real GTO has specific calling ranges
  if (OPENING_RANGES[position].includes(hand)) {
    return 'call';
  }

  return 'fold';
}

// Get explanation for why an action is correct
export function getActionExplanation(hand: string, position: Position, correctAction: Action, chosenAction: Action): string {
  const posName = POSITION_NAMES[position];

  if (correctAction === chosenAction) {
    switch (correctAction) {
      case 'open':
        return `Correct! ${hand} is in the standard opening range from ${posName}. This hand has good playability and equity.`;
      case 'fold':
        return `Correct! ${hand} is too weak to open from ${posName}. The position is too early or the hand lacks sufficient equity.`;
      case '3bet':
        return `Correct! ${hand} is a strong 3-betting hand in this situation. It has good equity and blockers.`;
      case 'call':
        return `Correct! ${hand} plays well as a call here, having decent equity but not quite strong enough to 3-bet.`;
    }
  }

  // Wrong answer explanations
  if (correctAction === 'open' && chosenAction === 'fold') {
    return `${hand} should be opened from ${posName}. While it may seem marginal, this hand has enough equity and playability to profitably open.`;
  }

  if (correctAction === 'fold' && chosenAction === 'open') {
    return `${hand} is too weak to open from ${posName}. From early position, you need stronger hands because you'll often face 3-bets and play out of position.`;
  }

  if (correctAction === '3bet' && chosenAction === 'call') {
    return `${hand} is strong enough to 3-bet here. By just calling, you miss value and allow the opener to realize equity cheaply.`;
  }

  if (correctAction === 'call' && chosenAction === '3bet') {
    return `${hand} plays better as a call. It's not strong enough to 3-bet for value, and as a bluff it doesn't have the best blockers.`;
  }

  return `The correct play with ${hand} from ${posName} is to ${correctAction}.`;
}

// Calculate hand strength category
export function getHandStrengthCategory(hand: string): 'premium' | 'strong' | 'playable' | 'marginal' | 'weak' {
  const premiumHands = ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo'];
  const strongHands = ['TT', '99', '88', 'AQs', 'AQo', 'AJs', 'KQs'];
  const playableHands = ['77', '66', '55', '44', '33', '22', 'ATs', 'A9s', 'AJo', 'ATo', 'KJs', 'KTs', 'KQo', 'QJs', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s', '65s', '54s'];

  if (premiumHands.includes(hand)) return 'premium';
  if (strongHands.includes(hand)) return 'strong';
  if (playableHands.includes(hand)) return 'playable';
  if (OPENING_RANGES.BTN.includes(hand)) return 'marginal';
  return 'weak';
}

// Generate a random preflop scenario
export function generatePreflopScenario(): {
  hand: string;
  position: Position;
  facing: 'open' | 'vs_raise';
  raiserPosition?: Position;
  correctAction: Action;
} {
  // Random position (exclude BB for now as it's more complex)
  const positions: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];
  const position = positions[Math.floor(Math.random() * positions.length)];

  // Random hand
  const hand = ALL_HANDS[Math.floor(Math.random() * ALL_HANDS.length)];

  // 70% chance of RFI spot, 30% chance of facing raise
  const facing = Math.random() < 0.7 ? 'open' : 'vs_raise';

  let raiserPosition: Position | undefined;
  if (facing === 'vs_raise') {
    // Pick a random earlier position as raiser
    const posIndex = positions.indexOf(position);
    if (posIndex > 0) {
      const earlierPositions = positions.slice(0, posIndex);
      raiserPosition = earlierPositions[Math.floor(Math.random() * earlierPositions.length)];
    } else {
      // If UTG, just make it RFI
      return {
        hand,
        position,
        facing: 'open',
        correctAction: getCorrectAction(hand, position, 'open'),
      };
    }
  }

  const correctAction = getCorrectAction(hand, position, facing, raiserPosition);

  return {
    hand,
    position,
    facing,
    raiserPosition,
    correctAction,
  };
}
