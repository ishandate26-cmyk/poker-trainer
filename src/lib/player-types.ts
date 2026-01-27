// Player type definitions for realistic training scenarios

export type PlayerType = 'TAG' | 'LAG' | 'NIT' | 'FISH' | 'MANIAC' | 'CALLING_STATION' | 'REG' | 'UNKNOWN';

export interface PlayerProfile {
  type: PlayerType;
  name: string;
  description: string;
  vpip: { min: number; max: number };  // Voluntarily Put $ In Pot
  pfr: { min: number; max: number };   // Pre-Flop Raise
  aggression: { min: number; max: number };
  traits: string[];
  exploits: string[];
  openingRange: string[];
  threeBetRange: string[];
  callingRange: string[];
}

export const PLAYER_PROFILES: Record<PlayerType, PlayerProfile> = {
  TAG: {
    type: 'TAG',
    name: 'Tight-Aggressive (TAG)',
    description: 'Plays a narrow range of hands but plays them aggressively. The classic winning style.',
    vpip: { min: 18, max: 25 },
    pfr: { min: 15, max: 22 },
    aggression: { min: 2.5, max: 4.0 },
    traits: [
      'Selective with starting hands',
      'Aggressive when entering pots',
      'Good hand reading skills',
      'Folds to pressure without strong hands',
      'Positionally aware',
    ],
    exploits: [
      'They fold too much to 3-bets with medium hands',
      'Tend to play predictably post-flop',
      'Can be bluffed off medium-strength hands',
      'May not adjust to loose table dynamics',
    ],
    openingRange: [
      'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77',
      'AKs', 'AQs', 'AJs', 'ATs', 'A5s', 'A4s',
      'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs', 'T9s', '98s',
      'AKo', 'AQo', 'AJo', 'KQo',
    ],
    threeBetRange: ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs'],
    callingRange: ['TT', '99', '88', '77', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs'],
  },

  LAG: {
    type: 'LAG',
    name: 'Loose-Aggressive (LAG)',
    description: 'Plays many hands aggressively. Difficult to play against, constantly applying pressure.',
    vpip: { min: 28, max: 40 },
    pfr: { min: 22, max: 35 },
    aggression: { min: 3.5, max: 6.0 },
    traits: [
      'Wide opening range',
      'Aggressive in all positions',
      'Frequent 3-betting and 4-betting',
      'Hard to put on a hand',
      'Applies maximum pressure',
    ],
    exploits: [
      'Can be trapped with strong hands',
      'Bluff-catches work well against them',
      'Let them hang themselves with second-best hands',
      'Tighten up and play for value',
    ],
    openingRange: [
      'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
      'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
      'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s',
      'QJs', 'QTs', 'Q9s', 'Q8s',
      'JTs', 'J9s', 'J8s',
      'T9s', 'T8s', 'T7s',
      '98s', '97s', '87s', '86s', '76s', '75s', '65s', '64s', '54s',
      'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o',
      'KQo', 'KJo', 'KTo', 'K9o',
      'QJo', 'QTo', 'JTo', 'T9o',
    ],
    threeBetRange: [
      'AA', 'KK', 'QQ', 'JJ', 'TT', '99', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs',
      'KQs', 'KJs', 'A5s', 'A4s', '76s', '87s', '98s',
    ],
    callingRange: ['88', '77', '66', 'AJo', 'ATo', 'KQo', 'KJs', 'QJs', 'JTs', 'T9s'],
  },

  NIT: {
    type: 'NIT',
    name: 'Nit (Ultra-Tight)',
    description: 'Only plays premium hands. Very predictable but rarely bluffs.',
    vpip: { min: 8, max: 14 },
    pfr: { min: 6, max: 12 },
    aggression: { min: 1.5, max: 3.0 },
    traits: [
      'Extremely selective',
      'Only raises with premiums',
      'Folds to most aggression',
      'Very predictable',
      'Rarely bluffs',
    ],
    exploits: [
      'Steal their blinds relentlessly',
      'Fold to their raises without the nuts',
      'Never bluff them',
      'Easy to put on a hand',
    ],
    openingRange: [
      'AA', 'KK', 'QQ', 'JJ', 'TT',
      'AKs', 'AQs', 'AKo', 'AQo',
    ],
    threeBetRange: ['AA', 'KK', 'QQ', 'AKs', 'AKo'],
    callingRange: ['JJ', 'TT', 'AQs'],
  },

  FISH: {
    type: 'FISH',
    name: 'Fish (Recreational)',
    description: 'Plays too many hands passively. Makes fundamental mistakes.',
    vpip: { min: 40, max: 65 },
    pfr: { min: 5, max: 15 },
    aggression: { min: 0.5, max: 1.5 },
    traits: [
      'Plays too many hands',
      'Limps frequently',
      'Calls too much post-flop',
      'Chases draws without odds',
      'Overvalues weak pairs',
    ],
    exploits: [
      'Value bet relentlessly',
      'Dont bluff - they call too much',
      'Bet big with strong hands',
      'Isolate them with raises',
    ],
    openingRange: [
      'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
      'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
      'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
      'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s',
      'JTs', 'J9s', 'J8s', 'J7s',
      'T9s', 'T8s', 'T7s',
      '98s', '97s', '96s',
      '87s', '86s', '76s', '75s', '65s', '64s', '54s', '53s', '43s',
      'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
      'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o',
      'QJo', 'QTo', 'Q9o', 'Q8o',
      'JTo', 'J9o', 'J8o',
      'T9o', 'T8o', '98o', '87o', '76o',
    ],
    threeBetRange: ['AA', 'KK', 'QQ'],
    callingRange: [
      'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
      'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs', 'JTs', 'T9s',
      'AQo', 'AJo', 'ATo', 'KQo', 'KJo', 'QJo',
    ],
  },

  MANIAC: {
    type: 'MANIAC',
    name: 'Maniac',
    description: 'Raises and re-raises constantly with any two cards. Very volatile.',
    vpip: { min: 50, max: 80 },
    pfr: { min: 35, max: 60 },
    aggression: { min: 5.0, max: 10.0 },
    traits: [
      'Raises almost every hand',
      'Will 4-bet and 5-bet light',
      'Unpredictable and chaotic',
      'Creates huge pots',
      'Forces mistakes from opponents',
    ],
    exploits: [
      'Wait for premium hands and let them build the pot',
      'Trap with slow plays',
      'Use their aggression against them',
      'Tighten up dramatically',
    ],
    openingRange: [
      // Almost everything
      'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
      'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
      'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
      'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s', 'Q4s', 'Q3s', 'Q2s',
      'JTs', 'J9s', 'J8s', 'J7s', 'J6s', 'J5s',
      'T9s', 'T8s', 'T7s', 'T6s',
      '98s', '97s', '96s', '95s',
      '87s', '86s', '85s', '76s', '75s', '74s', '65s', '64s', '63s', '54s', '53s', '52s', '43s', '42s', '32s',
      'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
      'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o', 'K6o', 'K5o',
      'QJo', 'QTo', 'Q9o', 'Q8o', 'Q7o',
      'JTo', 'J9o', 'J8o', 'J7o',
      'T9o', 'T8o', 'T7o',
      '98o', '97o', '87o', '86o', '76o', '75o', '65o', '54o',
    ],
    threeBetRange: [
      'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77',
      'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A5s', 'A4s', 'A3s', 'A2s',
      'KQs', 'KJs', 'KTs', 'K9s',
      'QJs', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s', '65s', '54s',
      'AKo', 'AQo', 'AJo', 'ATo', 'KQo',
    ],
    callingRange: [], // Maniacs rarely just call
  },

  CALLING_STATION: {
    type: 'CALLING_STATION',
    name: 'Calling Station',
    description: 'Calls almost everything but rarely raises. Will call you down with any piece.',
    vpip: { min: 45, max: 70 },
    pfr: { min: 3, max: 10 },
    aggression: { min: 0.3, max: 1.0 },
    traits: [
      'Calls with almost anything',
      'Rarely folds post-flop',
      'Never bluffs',
      'Passive and predictable',
      'Will call with bottom pair to the river',
    ],
    exploits: [
      'Never bluff them',
      'Value bet thin with any made hand',
      'Bet bigger for value',
      'Dont worry about being raised - they wont',
    ],
    openingRange: [
      'AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo',
    ],
    threeBetRange: ['AA', 'KK'],
    callingRange: [
      // They call everything
      'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
      'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
      'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s',
      'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s',
      'JTs', 'J9s', 'J8s', 'T9s', 'T8s', '98s', '97s', '87s', '76s', '65s', '54s',
      'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
      'KQo', 'KJo', 'KTo', 'K9o', 'K8o',
      'QJo', 'QTo', 'Q9o', 'JTo', 'J9o', 'T9o', '98o', '87o', '76o',
    ],
  },

  REG: {
    type: 'REG',
    name: 'Regular (Reg)',
    description: 'Competent winning player. Studies the game and plays solid fundamentals.',
    vpip: { min: 20, max: 28 },
    pfr: { min: 17, max: 25 },
    aggression: { min: 2.5, max: 4.5 },
    traits: [
      'Solid fundamentals',
      'Balanced ranges',
      'Good positional awareness',
      'Adjusts to opponents',
      'Hard to exploit',
    ],
    exploits: [
      'Requires more advanced exploits',
      'Look for their individual tendencies',
      'Avoid playing big pots without strong hands',
      'Focus on easier opponents at the table',
    ],
    openingRange: [
      'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55',
      'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A5s', 'A4s', 'A3s',
      'KQs', 'KJs', 'KTs', 'K9s',
      'QJs', 'QTs', 'Q9s',
      'JTs', 'J9s',
      'T9s', 'T8s',
      '98s', '97s',
      '87s', '86s',
      '76s', '75s',
      '65s',
      '54s',
      'AKo', 'AQo', 'AJo', 'ATo',
      'KQo', 'KJo',
      'QJo',
    ],
    threeBetRange: [
      'AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs', 'AJs', 'A5s', 'A4s',
      'KQs', 'KJs', '76s', '87s',
    ],
    callingRange: ['99', '88', '77', '66', 'AQo', 'AJo', 'KQs', 'KJs', 'QJs', 'JTs', 'T9s'],
  },

  UNKNOWN: {
    type: 'UNKNOWN',
    name: 'Unknown',
    description: 'No information yet. Assume a standard TAG approach until you gather data.',
    vpip: { min: 0, max: 100 },
    pfr: { min: 0, max: 100 },
    aggression: { min: 0, max: 10 },
    traits: [
      'No reads yet',
      'Play standard poker',
      'Observe their tendencies',
      'Dont assume anything',
    ],
    exploits: [
      'Gather information first',
      'Assume solid play until proven otherwise',
      'Take notes on their actions',
    ],
    openingRange: [
      'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77',
      'AKs', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs', 'JTs',
      'AKo', 'AQo', 'KQo',
    ],
    threeBetRange: ['AA', 'KK', 'QQ', 'AKs', 'AKo'],
    callingRange: ['JJ', 'TT', '99', 'AQs', 'AJs', 'KQs'],
  },
};

// Generate a random player type
export function generateRandomPlayerType(): PlayerType {
  const types: PlayerType[] = ['TAG', 'LAG', 'NIT', 'FISH', 'MANIAC', 'CALLING_STATION', 'REG'];
  const weights = [25, 15, 10, 25, 5, 15, 5]; // Probabilities roughly matching real games

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < types.length; i++) {
    random -= weights[i];
    if (random <= 0) return types[i];
  }

  return 'TAG';
}

// Get coaching advice for playing against a player type
export function getExploitAdvice(type: PlayerType, situation: 'preflop' | 'postflop'): string[] {
  const profile = PLAYER_PROFILES[type];

  if (situation === 'preflop') {
    switch (type) {
      case 'NIT':
        return [
          'Steal their blinds aggressively - they fold too much',
          'When they raise, give them credit for a strong hand',
          'Only continue vs their aggression with premiums',
        ];
      case 'FISH':
        return [
          'Raise to isolate them when they limp',
          'Size your value bets bigger - they call too much',
          'Dont bluff preflop - save bluffs for never',
        ];
      case 'LAG':
        return [
          'Widen your 3-bet range for value',
          'Be prepared for 4-bets with medium holdings',
          'Consider trapping with premiums occasionally',
        ];
      case 'MANIAC':
        return [
          'Tighten up your range significantly',
          'Let them build the pot with your strong hands',
          '4-bet premiums and some medium pairs for value',
        ];
      case 'CALLING_STATION':
        return [
          'Raise larger for value with strong hands',
          'Isolate them when they limp',
          'Dont bluff - they will call',
        ];
      default:
        return profile.exploits;
    }
  } else {
    switch (type) {
      case 'NIT':
        return [
          'Their bets mean strength - fold without the goods',
          'Bluff when draws miss if you have blockers',
          'Value bet thin against their checks',
        ];
      case 'FISH':
        return [
          'Value bet relentlessly, even thin',
          'They overvalue top pair - extract maximum value',
          'Dont bluff - seriously, dont bluff',
        ];
      case 'LAG':
        return [
          'Check-raise strong hands for value',
          'Call down lighter with bluff catchers',
          'Let them hang themselves',
        ];
      case 'MANIAC':
        return [
          'Pot control with medium hands',
          'Let them bluff into your strong hands',
          'Dont try to outplay - just wait for hands',
        ];
      case 'CALLING_STATION':
        return [
          'Bet every street for value with any pair+',
          'Size bigger on all streets',
          'Never bluff. Never. Ever.',
        ];
      default:
        return profile.exploits;
    }
  }
}
