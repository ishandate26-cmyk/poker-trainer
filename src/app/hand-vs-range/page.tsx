'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Card, createDeck, shuffleDeck, removeCards, cardsToHandNotation } from '@/lib/deck';
import { calculateEquityVsRangeFast } from '@/lib/equity-calculator';
import { HandDisplay } from '@/components/HandDisplay';
import { Board, BoardTexture } from '@/components/Board';
import { RangeGrid, PRESET_RANGES } from '@/components/RangeGrid';
import { CoachingFeedback, SessionStats, DifficultyBadge } from '@/components/CoachingFeedback';

type FeedbackSection = {
  title: string;
  content: string;
  type: 'success' | 'error' | 'info' | 'warning';
};
import { PLAYER_PROFILES, PlayerType, generateRandomPlayerType, getExploitAdvice } from '@/lib/player-types';

type Street = 'preflop' | 'flop' | 'turn' | 'river';

interface Scenario {
  heroHand: [Card, Card];
  board: Card[];
  villainType: PlayerType;
  villainRange: string[];
  street: Street;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
}

interface SessionResult {
  correct: number;
  total: number;
  streak: number;
  totalError: number;
}

function generateScenario(street: Street): Scenario {
  const deck = shuffleDeck(createDeck());
  const heroHand: [Card, Card] = [deck[0], deck[1]];

  let boardCount = 0;
  switch (street) {
    case 'flop': boardCount = 3; break;
    case 'turn': boardCount = 4; break;
    case 'river': boardCount = 5; break;
  }

  const board = deck.slice(2, 2 + boardCount);
  const villainType = generateRandomPlayerType();
  const profile = PLAYER_PROFILES[villainType];

  // Use a range based on villain type (opening range for simplicity)
  const villainRange = profile.openingRange;

  // Determine difficulty based on factors
  let difficulty: Scenario['difficulty'] = 'medium';
  const handNotation = cardsToHandNotation(heroHand);

  // Easy: Premium vs wide range
  if (['AA', 'KK', 'QQ', 'AKs', 'AKo'].includes(handNotation) && villainType === 'FISH') {
    difficulty = 'easy';
  }
  // Hard: Marginal hand vs tight range
  else if (!profile.openingRange.includes(handNotation) && villainType === 'NIT') {
    difficulty = 'hard';
  }
  // Expert: Post-flop decisions with draws
  else if (street !== 'preflop' && villainType === 'LAG') {
    difficulty = 'expert';
  }

  return {
    heroHand,
    board,
    villainType,
    villainRange,
    street,
    difficulty,
  };
}

export default function HandVsRangePage() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [guess, setGuess] = useState(50);
  const [actualEquity, setActualEquity] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [selectedStreet, setSelectedStreet] = useState<Street>('flop');
  const [session, setSession] = useState<SessionResult>({ correct: 0, total: 0, streak: 0, totalError: 0 });

  // Generate new scenario
  const newScenario = useCallback(() => {
    setScenario(generateScenario(selectedStreet));
    setGuess(50);
    setActualEquity(null);
    setShowResult(false);
  }, [selectedStreet]);

  // Initialize on mount
  useEffect(() => {
    newScenario();
  }, [newScenario]);

  // Submit guess
  const submitGuess = async () => {
    if (!scenario || isCalculating) return;

    setIsCalculating(true);

    // Calculate actual equity
    const result = calculateEquityVsRangeFast(
      scenario.heroHand,
      scenario.villainRange,
      scenario.board,
      3000
    );

    setActualEquity(result.equity);
    setShowResult(true);
    setIsCalculating(false);

    // Update session stats
    const error = Math.abs(guess - result.equity);
    const isCorrect = error <= 10; // Within 10% is considered correct

    setSession(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
      streak: isCorrect ? prev.streak + 1 : 0,
      totalError: prev.totalError + error,
    }));
  };

  // Get feedback based on result
  const getFeedback = () => {
    if (!scenario || actualEquity === null) return null;

    const error = Math.abs(guess - actualEquity);
    const isCorrect = error <= 10;
    const handNotation = cardsToHandNotation(scenario.heroHand);
    const profile = PLAYER_PROFILES[scenario.villainType];

    const sections: FeedbackSection[] = [];

    // Main result
    sections.push({
      title: isCorrect ? 'Good read!' : 'Off the mark',
      content: `You guessed ${guess.toFixed(0)}% equity. Actual equity is ${actualEquity.toFixed(1)}%. Error: ${error.toFixed(1)}%`,
      type: isCorrect ? 'success' : 'error',
    });

    // Range analysis
    sections.push({
      title: 'Range Analysis',
      content: `${profile.name} typically opens ${profile.vpip.min}-${profile.vpip.max}% of hands. Their range here is ${scenario.villainRange.length} hand combinations. ${profile.description}`,
      type: 'info',
    });

    // Hand strength context
    if (actualEquity > 60) {
      sections.push({
        title: 'Strong Position',
        content: `${handNotation} has strong equity against this range. In a real game, you\'d want to build the pot.`,
        type: 'success',
      });
    } else if (actualEquity < 40) {
      sections.push({
        title: 'Weak Position',
        content: `${handNotation} struggles against this range. Consider pot control or folding to aggression.`,
        type: 'warning',
      });
    } else {
      sections.push({
        title: 'Marginal Spot',
        content: `This is a marginal situation where your equity is close to break-even. Position and player tendencies matter most here.`,
        type: 'info',
      });
    }

    // Exploitation advice
    const advice = getExploitAdvice(scenario.villainType, scenario.street === 'preflop' ? 'preflop' : 'postflop');
    sections.push({
      title: `Exploiting ${profile.name}`,
      content: advice.join(' '),
      type: 'info',
    });

    // Thinking prompts
    const thinkingPrompts = [
      `What hands in villain's range beat ${handNotation}?`,
      `How does this board texture interact with their range?`,
      `Would villain bet/raise/call differently with different parts of their range?`,
      `How would your equity change if villain's range was tighter/wider?`,
    ];

    return { isCorrect, sections, thinkingPrompts };
  };

  if (!scenario) {
    return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">Loading...</div>;
  }

  const feedback = showResult ? getFeedback() : null;
  const handNotation = cardsToHandNotation(scenario.heroHand);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      {/* Header */}
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <Link href="/" className="text-gray-400 hover:text-white transition">
            ← Back
          </Link>
          <h1 className="text-2xl font-bold">Hand vs Range</h1>
          <SessionStats
            correct={session.correct}
            total={session.total}
            streak={session.streak}
            averageAccuracy={session.total > 0 ? 100 - (session.totalError / session.total) : undefined}
          />
        </div>

        {/* Street selector */}
        <div className="flex gap-2 mb-6 justify-center">
          {(['preflop', 'flop', 'turn', 'river'] as Street[]).map(street => (
            <button
              key={street}
              onClick={() => {
                setSelectedStreet(street);
                setScenario(generateScenario(street));
                setGuess(50);
                setActualEquity(null);
                setShowResult(false);
              }}
              className={`px-4 py-2 rounded-lg transition ${selectedStreet === street
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
            >
              {street.charAt(0).toUpperCase() + street.slice(1)}
            </button>
          ))}
        </div>

        {/* Scenario display */}
        <div className="bg-gray-900 rounded-xl p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <DifficultyBadge level={scenario.difficulty} />
            <div className="text-right">
              <div className="text-sm text-gray-400">Opponent</div>
              <div className="font-semibold text-yellow-400">{PLAYER_PROFILES[scenario.villainType].name}</div>
            </div>
          </div>

          {/* Your hand */}
          <div className="flex justify-center mb-6">
            <HandDisplay cards={scenario.heroHand} size="lg" label="Your Hand" />
          </div>

          {/* Board */}
          {scenario.board.length > 0 && (
            <div className="mb-4">
              <Board cards={scenario.board} size="md" />
              <BoardTexture cards={scenario.board} />
            </div>
          )}

          {/* Villain range */}
          <div className="mt-6">
            <h3 className="text-sm text-gray-400 mb-2 text-center">Opponent&apos;s Estimated Range</h3>
            <RangeGrid
              selectedHands={scenario.villainRange}
              readOnly
              heroHand={handNotation}
              showPercentage
            />
          </div>
        </div>

        {/* Equity guess */}
        {!showResult ? (
          <div className="bg-gray-900 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4 text-center">What is your equity?</h3>

            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-400 mb-2">
                <span>0%</span>
                <span className="text-2xl font-bold text-white">{guess}%</span>
                <span>100%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={guess}
                onChange={(e) => setGuess(Number(e.target.value))}
                className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>

            {/* Quick select buttons */}
            <div className="flex gap-2 justify-center mb-6 flex-wrap">
              {[20, 35, 50, 65, 80].map(val => (
                <button
                  key={val}
                  onClick={() => setGuess(val)}
                  className={`px-4 py-2 rounded-lg transition ${guess === val
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                >
                  {val}%
                </button>
              ))}
            </div>

            <button
              onClick={submitGuess}
              disabled={isCalculating}
              className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-lg font-semibold transition disabled:opacity-50"
            >
              {isCalculating ? 'Calculating...' : 'Submit'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Result display */}
            <div className="bg-gray-900 rounded-xl p-6 text-center">
              <div className="text-4xl font-bold mb-2">
                {actualEquity?.toFixed(1)}%
              </div>
              <div className="text-gray-400">Actual Equity</div>

              <div className="mt-4 flex justify-center gap-8">
                <div>
                  <div className="text-2xl font-semibold text-blue-400">{guess}%</div>
                  <div className="text-sm text-gray-400">Your Guess</div>
                </div>
                <div>
                  <div className={`text-2xl font-semibold ${Math.abs(guess - (actualEquity || 0)) <= 10 ? 'text-green-400' : 'text-red-400'}`}>
                    {Math.abs(guess - (actualEquity || 0)).toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-400">Error</div>
                </div>
              </div>
            </div>

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
              Next Scenario
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}
