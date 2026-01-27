'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  Card,
  createDeck,
  shuffleDeck,
  stringToCard,
  cardsToHandNotation,
} from '@/lib/deck';
import {
  Position,
  POSITIONS,
  POSITION_NAMES,
  OPENING_RANGES,
  THREE_BET_RANGES,
  getCorrectAction,
  getActionExplanation,
  getHandStrengthCategory,
  Action,
} from '@/lib/preflop-ranges';
import { PlayingCard } from '@/components/PlayingCard';
import { HandDisplay, PositionIndicator, StackDisplay } from '@/components/HandDisplay';
import { CoachingFeedback, SessionStats, DifficultyBadge } from '@/components/CoachingFeedback';
import { PLAYER_PROFILES, PlayerType, generateRandomPlayerType, getExploitAdvice } from '@/lib/player-types';
import { RangeGrid } from '@/components/RangeGrid';

type FeedbackSection = {
  title: string;
  content: string;
  type: 'success' | 'error' | 'info' | 'warning';
};

interface TablePlayer {
  position: Position;
  type: PlayerType;
  stack: number;
  hasActed: boolean;
  action?: 'fold' | 'call' | 'raise';
  raiseSize?: number;
}

interface Scenario {
  heroHand: [Card, Card];
  heroPosition: Position;
  heroStack: number;
  players: TablePlayer[];
  potSize: number;
  facingAction: 'open' | 'vs_raise' | 'vs_limp';
  raiserPosition?: Position;
  raiserType?: PlayerType;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  tableSize: 6 | 9;
}

function generateScenario(tableSize: 6 | 9 = 6): Scenario {
  const deck = shuffleDeck(createDeck());
  const heroHand: [Card, Card] = [deck[0], deck[1]];
  const handNotation = cardsToHandNotation(heroHand);
  const handStrength = getHandStrengthCategory(handNotation);

  // Select hero position with weighted randomness
  const availablePositions: Position[] = tableSize === 6
    ? ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']
    : ['UTG', 'UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']; // Simplified for 9-max

  const heroPosition = availablePositions[Math.floor(Math.random() * availablePositions.length)];

  // Generate players at the table
  const players: TablePlayer[] = [];
  for (const pos of POSITIONS) {
    if (pos === heroPosition) continue;

    players.push({
      position: pos,
      type: generateRandomPlayerType(),
      stack: 80 + Math.floor(Math.random() * 120), // 80-200bb
      hasActed: false,
    });
  }

  // Determine the action scenario
  const heroPositionIndex = POSITIONS.indexOf(heroPosition);
  const earlierPositions = players.filter(p => POSITIONS.indexOf(p.position) < heroPositionIndex);

  // Randomly decide what action we're facing
  const rand = Math.random();
  let facingAction: Scenario['facingAction'] = 'open';
  let raiserPosition: Position | undefined;
  let raiserType: PlayerType | undefined;
  let potSize = 1.5; // SB + BB

  if (earlierPositions.length > 0 && rand > 0.4) {
    // 60% chance of facing action if players acted before us
    if (rand > 0.7) {
      // Facing a raise
      const raiser = earlierPositions[Math.floor(Math.random() * earlierPositions.length)];
      raiser.hasActed = true;
      raiser.action = 'raise';
      raiser.raiseSize = 2.5 + Math.random() * 1.5; // 2.5-4bb open
      raiserPosition = raiser.position;
      raiserType = raiser.type;
      potSize += raiser.raiseSize;
      facingAction = 'vs_raise';
    } else if (rand > 0.5) {
      // Facing a limp
      const limper = earlierPositions[Math.floor(Math.random() * earlierPositions.length)];
      limper.hasActed = true;
      limper.action = 'call';
      potSize += 1;
      facingAction = 'vs_limp';
    }
  }

  // Mark folds for positions between raiser and hero
  if (facingAction === 'vs_raise' && raiserPosition) {
    const raiserIndex = POSITIONS.indexOf(raiserPosition);
    for (const player of players) {
      const playerIndex = POSITIONS.indexOf(player.position);
      if (playerIndex > raiserIndex && playerIndex < heroPositionIndex) {
        player.hasActed = true;
        player.action = 'fold';
      }
    }
  }

  // Determine difficulty
  let difficulty: Scenario['difficulty'] = 'medium';

  if (handStrength === 'premium') {
    difficulty = 'easy';
  } else if (handStrength === 'weak' && heroPosition === 'UTG') {
    difficulty = 'easy'; // Easy fold
  } else if (handStrength === 'marginal' && facingAction === 'vs_raise') {
    difficulty = 'hard';
  } else if (raiserType === 'MANIAC' || raiserType === 'LAG') {
    difficulty = 'hard';
  }

  return {
    heroHand,
    heroPosition,
    heroStack: 100 + Math.floor(Math.random() * 100),
    players,
    potSize,
    facingAction,
    raiserPosition,
    raiserType,
    difficulty,
    tableSize,
  };
}

function getCorrectActionForScenario(scenario: Scenario): Action {
  const handNotation = cardsToHandNotation(scenario.heroHand);

  if (scenario.facingAction === 'open' || scenario.facingAction === 'vs_limp') {
    // Should we open or iso-raise?
    if (OPENING_RANGES[scenario.heroPosition].includes(handNotation)) {
      return 'open';
    }
    return 'fold';
  }

  if (scenario.facingAction === 'vs_raise' && scenario.raiserPosition) {
    // Should we 3-bet, call, or fold?
    const threeBetRange = THREE_BET_RANGES[scenario.heroPosition]?.[scenario.raiserPosition] || [];

    if (threeBetRange.includes(handNotation)) {
      return '3bet';
    }

    // Simplified calling range: hands in opening range but not 3-bet range
    const openingRange = OPENING_RANGES[scenario.heroPosition];
    if (openingRange.includes(handNotation)) {
      return 'call';
    }

    return 'fold';
  }

  return 'fold';
}

export default function PreflopPage() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showRangeChart, setShowRangeChart] = useState(false);
  const [tableSize, setTableSize] = useState<6 | 9>(6);
  const [session, setSession] = useState({ correct: 0, total: 0, streak: 0 });

  const newScenario = useCallback(() => {
    setScenario(generateScenario(tableSize));
    setSelectedAction(null);
    setShowResult(false);
    setShowRangeChart(false);
  }, [tableSize]);

  useEffect(() => {
    newScenario();
  }, [newScenario]);

  const submitAction = (action: Action) => {
    if (!scenario || showResult) return;

    setSelectedAction(action);
    setShowResult(true);

    const correctAction = getCorrectActionForScenario(scenario);
    const isCorrect = action === correctAction;

    setSession(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
      streak: isCorrect ? prev.streak + 1 : 0,
    }));
  };

  const getFeedback = () => {
    if (!scenario || !selectedAction) return null;

    const handNotation = cardsToHandNotation(scenario.heroHand);
    const correctAction = getCorrectActionForScenario(scenario);
    const isCorrect = selectedAction === correctAction;
    const handStrength = getHandStrengthCategory(handNotation);

    const sections: FeedbackSection[] = [];

    // Main result
    sections.push({
      title: isCorrect ? 'Correct decision!' : 'Suboptimal play',
      content: isCorrect
        ? `${selectedAction.toUpperCase()} is the right play with ${handNotation} from ${scenario.heroPosition}.`
        : `The correct play is ${correctAction.toUpperCase()}, not ${selectedAction.toUpperCase()}.`,
      type: isCorrect ? 'success' : 'error',
    });

    // Position analysis
    sections.push({
      title: 'Position Context',
      content: `From ${POSITION_NAMES[scenario.heroPosition]}, you have ${POSITIONS.length - POSITIONS.indexOf(scenario.heroPosition) - 1} players to act behind you. ${scenario.heroPosition === 'BTN' ? 'You have the best position and can play wider.' : scenario.heroPosition === 'UTG' ? 'You\'re first to act and need a strong range.' : 'Consider position relative to remaining players.'}`,
      type: 'info',
    });

    // Hand strength
    const handStrengthType: FeedbackSection['type'] = handStrength === 'premium' || handStrength === 'strong' ? 'success' : handStrength === 'weak' ? 'warning' : 'info';
    sections.push({
      title: 'Hand Strength',
      content: `${handNotation} is a ${handStrength} hand. ${handStrength === 'premium' ? 'This is a top-tier hand that should almost always be played aggressively.' : handStrength === 'strong' ? 'A solid hand that plays well in most situations.' : handStrength === 'playable' ? 'Playable in the right position but be selective.' : handStrength === 'marginal' ? 'Marginal hands require good position and favorable conditions.' : 'This hand struggles to make money from early position.'}`,
      type: handStrengthType,
    });

    // Opponent-specific advice if facing raise
    if (scenario.facingAction === 'vs_raise' && scenario.raiserType) {
      const raiserProfile = PLAYER_PROFILES[scenario.raiserType];
      const exploitAdvice = getExploitAdvice(scenario.raiserType, 'preflop');

      sections.push({
        title: `Adjusting vs ${raiserProfile.name}`,
        content: `${raiserProfile.description} ${exploitAdvice[0]}`,
        type: 'info',
      });
    }

    // Why the correct action is right
    sections.push({
      title: 'Why This Play?',
      content: getActionExplanation(handNotation, scenario.heroPosition, correctAction, selectedAction),
      type: correctAction === selectedAction ? 'success' : 'warning',
    });

    // Thinking prompts
    const thinkingPrompts = [
      `What hands would you open/3-bet in this spot that you might be folding?`,
      `How does your position affect your range here?`,
      `What would you do if the raise came from a different position?`,
      `How would a LAG vs NIT change your decision?`,
      scenario.facingAction === 'vs_raise' ? `What's your plan if you call and face a c-bet?` : `What sizing would you use for this open?`,
    ];

    return { isCorrect, sections, thinkingPrompts };
  };

  if (!scenario) {
    return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">Loading...</div>;
  }

  const feedback = showResult ? getFeedback() : null;
  const handNotation = cardsToHandNotation(scenario.heroHand);
  const correctAction = getCorrectActionForScenario(scenario);

  // Get available actions based on situation
  const getAvailableActions = (): { action: Action; label: string; hotkey: string }[] => {
    if (scenario.facingAction === 'vs_raise') {
      return [
        { action: 'fold', label: 'Fold', hotkey: 'F' },
        { action: 'call', label: 'Call', hotkey: 'C' },
        { action: '3bet', label: '3-Bet', hotkey: 'R' },
      ];
    }
    return [
      { action: 'fold', label: 'Fold', hotkey: 'F' },
      { action: 'open', label: scenario.facingAction === 'vs_limp' ? 'Iso-Raise' : 'Open', hotkey: 'O' },
    ];
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <Link href="/" className="text-gray-400 hover:text-white transition">
            ← Back
          </Link>
          <h1 className="text-2xl font-bold">Preflop Trainer</h1>
          <SessionStats correct={session.correct} total={session.total} streak={session.streak} />
        </div>

        {/* Table size selector */}
        <div className="flex gap-2 mb-6 justify-center">
          {([6, 9] as const).map(size => (
            <button
              key={size}
              onClick={() => {
                setTableSize(size);
                setScenario(generateScenario(size));
                setSelectedAction(null);
                setShowResult(false);
              }}
              className={`px-4 py-2 rounded-lg transition ${tableSize === size
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
            >
              {size}-Max
            </button>
          ))}
        </div>

        {/* Scenario display */}
        <div className="bg-gray-900 rounded-xl p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <DifficultyBadge level={scenario.difficulty} />
            <div className="text-right">
              <div className="text-sm text-gray-400">Pot Size</div>
              <div className="font-semibold text-green-400">{scenario.potSize.toFixed(1)} BB</div>
            </div>
          </div>

          {/* Table visualization */}
          <div className="relative bg-green-900/30 rounded-full w-full max-w-md mx-auto aspect-[2/1] mb-6 border-4 border-green-800">
            {/* Dealer button indicator */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-xs text-gray-400">
              {scenario.tableSize}-Max Table
            </div>

            {/* Position indicators around the table */}
            {scenario.players.map((player, idx) => {
              const positions = scenario.tableSize === 6 ? 6 : 9;
              const angle = ((idx + 1) / (positions + 1)) * Math.PI; // Distribute around semi-circle
              const x = 50 + 40 * Math.cos(angle);
              const y = 80 - 35 * Math.sin(angle);

              return (
                <div
                  key={player.position}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <div className="text-center">
                    <PositionIndicator position={player.position} />
                    {player.hasActed && (
                      <div className={`text-xs mt-1 ${player.action === 'raise' ? 'text-red-400' : player.action === 'fold' ? 'text-gray-500' : 'text-yellow-400'
                        }`}>
                        {player.action === 'raise' ? `${player.raiseSize?.toFixed(1)}bb` : player.action}
                      </div>
                    )}
                    {player.position === scenario.raiserPosition && (
                      <div className="text-xs text-yellow-400 mt-1">
                        {PLAYER_PROFILES[player.type].name.split(' ')[0]}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Hero position */}
            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
              <PositionIndicator position={scenario.heroPosition} isHero />
              <div className="text-xs text-center mt-1">
                <StackDisplay stackBB={scenario.heroStack} />
              </div>
            </div>
          </div>

          {/* Your hand */}
          <div className="flex justify-center mb-4">
            <HandDisplay cards={scenario.heroHand} size="lg" label="Your Hand" />
          </div>

          {/* Situation description */}
          <div className="text-center text-gray-300 mb-4">
            {scenario.facingAction === 'open' && (
              <p>Action folds to you. What do you do?</p>
            )}
            {scenario.facingAction === 'vs_limp' && (
              <p>There is a limp in front. What do you do?</p>
            )}
            {scenario.facingAction === 'vs_raise' && scenario.raiserPosition && (
              <p>
                <span className="text-yellow-400">{PLAYER_PROFILES[scenario.raiserType!].name}</span> in{' '}
                <span className="text-blue-400">{scenario.raiserPosition}</span> raises to{' '}
                <span className="text-green-400">{scenario.players.find(p => p.position === scenario.raiserPosition)?.raiseSize?.toFixed(1)}bb</span>.
                What do you do?
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {!showResult ? (
          <div className="bg-gray-900 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4 text-center">Your Action</h3>
            <div className="flex gap-4 justify-center">
              {getAvailableActions().map(({ action, label, hotkey }) => (
                <button
                  key={action}
                  onClick={() => submitAction(action)}
                  className={`px-8 py-4 rounded-lg font-semibold transition text-lg ${action === 'fold'
                      ? 'bg-gray-700 hover:bg-gray-600'
                      : action === '3bet' || action === 'open'
                        ? 'bg-red-600 hover:bg-red-500'
                        : 'bg-blue-600 hover:bg-blue-500'
                    }`}
                >
                  {label}
                  <span className="block text-xs text-gray-300 mt-1">({hotkey})</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Result */}
            <div className={`p-6 rounded-xl text-center ${selectedAction === correctAction ? 'bg-green-900/30 border border-green-500' : 'bg-red-900/30 border border-red-500'
              }`}>
              <div className="text-3xl font-bold mb-2">
                {selectedAction === correctAction ? 'Correct!' : 'Incorrect'}
              </div>
              <div className="flex justify-center gap-8 text-lg">
                <div>
                  <div className="text-gray-400">You chose</div>
                  <div className={selectedAction === correctAction ? 'text-green-400' : 'text-red-400'}>
                    {selectedAction?.toUpperCase()}
                  </div>
                </div>
                {selectedAction !== correctAction && (
                  <div>
                    <div className="text-gray-400">Correct</div>
                    <div className="text-green-400">{correctAction.toUpperCase()}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Show range chart toggle */}
            <button
              onClick={() => setShowRangeChart(!showRangeChart)}
              className="w-full py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition"
            >
              {showRangeChart ? 'Hide' : 'Show'} Range Chart for {scenario.heroPosition}
            </button>

            {showRangeChart && (
              <div className="bg-gray-900 rounded-xl p-4">
                <h4 className="text-center text-sm text-gray-400 mb-2">
                  Opening Range from {scenario.heroPosition}
                </h4>
                <RangeGrid
                  selectedHands={OPENING_RANGES[scenario.heroPosition]}
                  readOnly
                  heroHand={handNotation}
                />
              </div>
            )}

            {/* Coaching feedback */}
            {feedback && (
              <CoachingFeedback
                isCorrect={feedback.isCorrect}
                sections={feedback.sections}
                thinkingPrompts={feedback.thinkingPrompts}
              />
            )}

            <button
              onClick={newScenario}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition"
            >
              Next Hand
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
