'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Card, createDeck, shuffleDeck, RANKS, SUITS, rankValue, suitSymbol, stringToCard } from '@/lib/deck';
import { evaluateHand, findNuts, HAND_RANK_NAMES, HandRank } from '@/lib/hand-evaluator';
import { Board, BoardTexture } from '@/components/Board';
import { CoachingFeedback, SessionStats, DifficultyBadge } from '@/components/CoachingFeedback';
import { PlayingCard } from '@/components/PlayingCard';

type QuestionType = 'nuts' | 'flush_combos' | 'straight_combos' | 'board_texture' | 'blockers' | 'hand_strength';

interface Question {
  type: QuestionType;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  thinkingPrompts: string[];
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
}

interface Scenario {
  board: Card[];
  question: Question;
}

// Count flush combinations possible
function countFlushCombos(board: Card[]): number {
  const suitCounts: Record<string, number> = { h: 0, d: 0, c: 0, s: 0 };
  for (const card of board) {
    suitCounts[card.suit]++;
  }

  let combos = 0;
  for (const [suit, count] of Object.entries(suitCounts)) {
    if (count >= 3) {
      // Number of remaining cards of that suit
      const remaining = 13 - count;
      // C(remaining, 2) for 3 on board, C(remaining, 1) for 4 on board
      if (count === 3) {
        combos += (remaining * (remaining - 1)) / 2;
      } else if (count === 4) {
        combos += remaining;
      } else if (count === 5) {
        // Flush on board, but player can have better flush card
        combos += remaining;
      }
    }
  }
  return combos;
}

// Count straight combinations possible
function countStraightCombos(board: Card[]): number {
  const boardRanks = [...new Set(board.map(c => rankValue(c.rank)))].sort((a, b) => a - b);

  // Check all possible 5-card straights
  let straights = 0;
  const allStraights = [
    [0, 1, 2, 3, 4],   // A-5 (wheel)
    [1, 2, 3, 4, 5],   // 2-6
    [2, 3, 4, 5, 6],
    [3, 4, 5, 6, 7],
    [4, 5, 6, 7, 8],
    [5, 6, 7, 8, 9],
    [6, 7, 8, 9, 10],
    [7, 8, 9, 10, 11],
    [8, 9, 10, 11, 12], // T-A
  ];

  // Add wheel (A=12 but also counts as 0)
  const ranksWithAce = [...boardRanks];
  if (boardRanks.includes(12)) ranksWithAce.push(-1); // A low

  for (const straight of allStraights) {
    const needed = straight.filter(r => !boardRanks.includes(r) && !(r === 0 && boardRanks.includes(12)));

    if (needed.length <= 2) {
      // Can make this straight with 2 or fewer cards
      // Simplified: just count it as possible
      straights++;
    }
  }

  return straights;
}

// Generate a nuts question
function generateNutsQuestion(board: Card[]): Question {
  const nuts = findNuts(board);

  if (!nuts) {
    return {
      type: 'nuts',
      text: 'What is the best possible hand (the nuts)?',
      options: ['Error generating question'],
      correctIndex: 0,
      explanation: 'Could not determine nuts',
      thinkingPrompts: [],
      difficulty: 'easy',
    };
  }

  const nutsHand = nuts.evaluated;
  const nutsCards = nuts.hand;

  // Generate wrong answers
  const wrongAnswers: string[] = [];

  // Common wrong nuts
  if (nutsHand.rank === HandRank.STRAIGHT_FLUSH || nutsHand.rank === HandRank.ROYAL_FLUSH) {
    wrongAnswers.push(`Ace-high flush`);
    wrongAnswers.push(`Broadway straight`);
    wrongAnswers.push(`Full house`);
  } else if (nutsHand.rank === HandRank.FOUR_OF_A_KIND) {
    wrongAnswers.push(`Straight flush`);
    wrongAnswers.push(`Full house with top pair`);
    wrongAnswers.push(`Ace-high flush`);
  } else if (nutsHand.rank === HandRank.FULL_HOUSE) {
    wrongAnswers.push(`Top set`);
    wrongAnswers.push(`Second-nut full house`);
    wrongAnswers.push(`Ace-high flush`);
  } else if (nutsHand.rank === HandRank.FLUSH) {
    wrongAnswers.push(`King-high flush`);
    wrongAnswers.push(`Nut straight`);
    wrongAnswers.push(`Top two pair`);
  } else if (nutsHand.rank === HandRank.STRAIGHT) {
    wrongAnswers.push(`Second-nut straight`);
    wrongAnswers.push(`Top set`);
    wrongAnswers.push(`Top two pair`);
  } else {
    wrongAnswers.push(`Top pair top kicker`);
    wrongAnswers.push(`Two pair`);
    wrongAnswers.push(`Middle set`);
  }

  // Format correct answer
  const correctAnswer = `${nutsHand.rankName}: ${nutsCards[0].rank}${suitSymbol(nutsCards[0].suit)} ${nutsCards[1].rank}${suitSymbol(nutsCards[1].suit)}`;

  // Shuffle options
  const options = [correctAnswer, ...wrongAnswers.slice(0, 3)];
  const shuffledOptions = options.sort(() => Math.random() - 0.5);
  const correctIndex = shuffledOptions.indexOf(correctAnswer);

  return {
    type: 'nuts',
    text: 'What is the nuts (best possible hand)?',
    options: shuffledOptions,
    correctIndex,
    explanation: `The nuts is ${nutsHand.rankName} with ${nutsCards[0].rank}${suitSymbol(nutsCards[0].suit)} ${nutsCards[1].rank}${suitSymbol(nutsCards[1].suit)}. Always identify the nuts first to understand the hand strength hierarchy on any board.`,
    thinkingPrompts: [
      'Can a straight flush be made on this board?',
      'Is the board paired (allowing full houses or quads)?',
      'How many cards of one suit are there?',
      'What\'s the highest possible straight?',
    ],
    difficulty: nutsHand.rank >= HandRank.FULL_HOUSE ? 'hard' : 'medium',
  };
}

// Generate a flush combos question
function generateFlushCombosQuestion(board: Card[]): Question {
  const suitCounts: Record<string, number> = { h: 0, d: 0, c: 0, s: 0 };
  for (const card of board) {
    suitCounts[card.suit]++;
  }

  const flushSuit = Object.entries(suitCounts).find(([, count]) => count >= 3)?.[0] as keyof typeof suitSymbol | undefined;

  if (!flushSuit) {
    return generateBoardTextureQuestion(board); // Fallback
  }

  const remaining = 13 - suitCounts[flushSuit];
  const onBoard = suitCounts[flushSuit];

  // Calculate actual combos based on cards needed
  let correctCombos: number;
  if (onBoard === 3) {
    correctCombos = (remaining * (remaining - 1)) / 2; // Need 2 cards
  } else if (onBoard === 4) {
    correctCombos = remaining; // Need 1 card
  } else {
    correctCombos = 0; // Flush on board
  }

  const options = [
    correctCombos.toString(),
    (correctCombos + 10).toString(),
    Math.max(0, correctCombos - 8).toString(),
    (correctCombos + 25).toString(),
  ].sort(() => Math.random() - 0.5);

  return {
    type: 'flush_combos',
    text: `How many flush combinations are possible with ${suitSymbol(flushSuit)} on this board?`,
    options,
    correctIndex: options.indexOf(correctCombos.toString()),
    explanation: `With ${onBoard} ${suitSymbol(flushSuit)} on board, there are ${remaining} remaining ${suitSymbol(flushSuit)} cards. ${onBoard === 3 ? `Need 2 cards: C(${remaining},2) = ${correctCombos}` : `Need 1 card: ${remaining} combos`}. Understanding combo counts helps you assess how likely opponents are to have specific hands.`,
    thinkingPrompts: [
      'How many cards of this suit are on the board?',
      'How many remain in the deck?',
      'If you hold a blocker, how does that change the count?',
      'How does this affect your bluffing frequency?',
    ],
    difficulty: 'hard',
  };
}

// Generate a board texture question
function generateBoardTextureQuestion(board: Card[]): Question {
  const suitCounts: Record<string, number> = { h: 0, d: 0, c: 0, s: 0 };
  for (const card of board) {
    suitCounts[card.suit]++;
  }

  const maxSuit = Math.max(...Object.values(suitCounts));
  const ranks = board.map(c => rankValue(c.rank)).sort((a, b) => a - b);
  const uniqueRanks = [...new Set(ranks)];
  const isPaired = uniqueRanks.length < board.length;

  // Check connectivity
  let gaps = 0;
  for (let i = 1; i < uniqueRanks.length; i++) {
    gaps += uniqueRanks[i] - uniqueRanks[i - 1] - 1;
  }

  const isConnected = gaps <= 2 && uniqueRanks.length >= 3;
  const hasHighCards = ranks.some(r => r >= 10); // J, Q, K, A

  // Determine the correct texture
  let correctTexture: string;
  let otherTextures: string[];

  if (maxSuit >= 3 && isConnected) {
    correctTexture = 'Wet (flush draw + straight possible)';
    otherTextures = ['Dry', 'Semi-wet', 'Neutral'];
  } else if (maxSuit >= 3) {
    correctTexture = 'Semi-wet (flush draw)';
    otherTextures = ['Dry', 'Very wet', 'Neutral'];
  } else if (isConnected) {
    correctTexture = 'Semi-wet (straight possible)';
    otherTextures = ['Dry', 'Very wet', 'Monotone'];
  } else if (isPaired) {
    correctTexture = 'Static (paired board)';
    otherTextures = ['Dynamic', 'Wet', 'Connected'];
  } else {
    correctTexture = 'Dry (disconnected, rainbow)';
    otherTextures = ['Wet', 'Semi-wet', 'Connected'];
  }

  const options = [correctTexture, ...otherTextures].sort(() => Math.random() - 0.5);

  return {
    type: 'board_texture',
    text: 'How would you describe this board texture?',
    options,
    correctIndex: options.indexOf(correctTexture),
    explanation: `This board is ${correctTexture.toLowerCase()}. ${maxSuit >= 3 ? 'Multiple cards of one suit create flush possibilities.' : ''} ${isConnected ? 'Connected cards allow straight draws.' : ''} ${isPaired ? 'Paired boards allow full houses and quads.' : ''} Board texture determines which hands have equity and how aggressive you should be.`,
    thinkingPrompts: [
      'How many draws are possible?',
      'Does this board favor the preflop raiser or caller?',
      'How does texture affect bet sizing?',
      'Which hands will continue here?',
    ],
    difficulty: 'easy',
  };
}

// Generate a blocker question
function generateBlockerQuestion(board: Card[]): Question {
  const nuts = findNuts(board);
  if (!nuts) return generateBoardTextureQuestion(board);

  const nutsRank = nuts.evaluated.rank;
  const nutsCards = nuts.hand;

  // Create blocker question
  let blockerCard: string;
  let blockedHand: string;

  if (nutsRank === HandRank.FLUSH || nutsRank === HandRank.STRAIGHT_FLUSH) {
    const flushSuit = board.find(c => {
      const count = board.filter(b => b.suit === c.suit).length;
      return count >= 3;
    })?.suit || 'h';

    blockerCard = `A${suitSymbol(flushSuit)}`;
    blockedHand = 'nut flush';
  } else if (nutsRank === HandRank.STRAIGHT) {
    const highRank = nuts.evaluated.kickers[0];
    blockerCard = `${highRank}`;
    blockedHand = 'nut straight';
  } else {
    blockerCard = `${board[0].rank}`;
    blockedHand = 'top set';
  }

  const question = `If you hold ${blockerCard}, what hand do you block?`;

  const options = [
    blockedHand.charAt(0).toUpperCase() + blockedHand.slice(1),
    'Bottom set',
    'Middle pair',
    'Flush draw',
  ].sort(() => Math.random() - 0.5);

  return {
    type: 'blockers',
    text: question,
    options,
    correctIndex: options.indexOf(blockedHand.charAt(0).toUpperCase() + blockedHand.slice(1)),
    explanation: `Holding ${blockerCard} blocks the ${blockedHand}. When bluffing, you want to block hands that would call. When value betting, you want opponents to have calling hands (don't block them).`,
    thinkingPrompts: [
      'What hands does your card remove from villain\'s range?',
      'Is this a good blocker for bluffing or value?',
      'How does this change your opponent\'s likely holdings?',
      'Should you bet more or less with this blocker?',
    ],
    difficulty: 'hard',
  };
}

// Generate a hand strength question
function generateHandStrengthQuestion(board: Card[]): Question {
  // Pick a random hand and evaluate it
  const deck = shuffleDeck(createDeck());
  const availableCards = deck.filter(c =>
    !board.some(b => b.rank === c.rank && b.suit === c.suit)
  );

  const hand: [Card, Card] = [availableCards[0], availableCards[1]];
  const allCards = [...hand, ...board];
  const evaluated = evaluateHand(allCards);

  const question = `With ${hand[0].rank}${suitSymbol(hand[0].suit)} ${hand[1].rank}${suitSymbol(hand[1].suit)}, what is your made hand?`;

  const wrongOptions = Object.values(HAND_RANK_NAMES).filter(name => name !== evaluated.rankName).slice(0, 3);
  const options = [evaluated.rankName, ...wrongOptions].sort(() => Math.random() - 0.5);

  return {
    type: 'hand_strength',
    text: question,
    options,
    correctIndex: options.indexOf(evaluated.rankName),
    explanation: `Your hand is ${evaluated.rankName}. The 5-card combination is made using the best cards from your hole cards and the board.`,
    thinkingPrompts: [
      'What board cards are you using?',
      'Could your hand improve on later streets?',
      'How does your hand rank against the nuts?',
      'What hands beat you?',
    ],
    difficulty: evaluated.rank >= HandRank.STRAIGHT ? 'easy' : 'medium',
  };
}

function generateScenario(): Scenario {
  const deck = shuffleDeck(createDeck());
  const numCards = Math.random() < 0.3 ? 3 : Math.random() < 0.7 ? 4 : 5;
  const board = deck.slice(0, numCards);

  // Pick question type
  const types: QuestionType[] = ['nuts', 'board_texture', 'hand_strength', 'blockers', 'flush_combos'];
  const weights = [30, 25, 25, 10, 10];

  let total = 0;
  let rand = Math.random() * weights.reduce((a, b) => a + b, 0);

  let questionType: QuestionType = 'nuts';
  for (let i = 0; i < types.length; i++) {
    total += weights[i];
    if (rand <= total) {
      questionType = types[i];
      break;
    }
  }

  // Check if flush question is valid
  const suitCounts = board.reduce((acc, c) => {
    acc[c.suit] = (acc[c.suit] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (questionType === 'flush_combos' && Math.max(...Object.values(suitCounts)) < 3) {
    questionType = 'board_texture';
  }

  let question: Question;
  switch (questionType) {
    case 'nuts':
      question = generateNutsQuestion(board);
      break;
    case 'flush_combos':
      question = generateFlushCombosQuestion(board);
      break;
    case 'board_texture':
      question = generateBoardTextureQuestion(board);
      break;
    case 'blockers':
      question = generateBlockerQuestion(board);
      break;
    case 'hand_strength':
      question = generateHandStrengthQuestion(board);
      break;
    default:
      question = generateNutsQuestion(board);
  }

  return { board, question };
}

export default function BoardReadingPage() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [session, setSession] = useState({ correct: 0, total: 0, streak: 0 });

  const newScenario = useCallback(() => {
    setScenario(generateScenario());
    setSelectedAnswer(null);
    setShowResult(false);
  }, []);

  useEffect(() => {
    newScenario();
  }, [newScenario]);

  const submitAnswer = (index: number) => {
    if (!scenario || showResult) return;

    setSelectedAnswer(index);
    setShowResult(true);

    const isCorrect = index === scenario.question.correctIndex;
    setSession(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
      streak: isCorrect ? prev.streak + 1 : 0,
    }));
  };

  if (!scenario) {
    return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">Loading...</div>;
  }

  const { board, question } = scenario;
  const isCorrect = selectedAnswer === question.correctIndex;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <Link href="/" className="text-gray-400 hover:text-white transition">
            ← Back
          </Link>
          <h1 className="text-2xl font-bold">Board Reading</h1>
          <SessionStats correct={session.correct} total={session.total} streak={session.streak} />
        </div>

        {/* Board display */}
        <div className="bg-gray-900 rounded-xl p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <DifficultyBadge level={question.difficulty} />
            <div className="text-sm text-gray-400">
              {board.length === 3 ? 'Flop' : board.length === 4 ? 'Turn' : 'River'}
            </div>
          </div>

          <div className="flex justify-center mb-4">
            <Board cards={board} size="lg" showSlots={false} />
          </div>

          <BoardTexture cards={board} />
        </div>

        {/* Question */}
        <div className="bg-gray-900 rounded-xl p-6 mb-6">
          <h3 className="text-xl font-semibold mb-6 text-center">{question.text}</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {question.options.map((option, index) => {
              let buttonClass = 'p-4 rounded-lg border-2 transition text-left font-medium ';

              if (!showResult) {
                buttonClass += 'border-gray-700 bg-gray-800 hover:border-blue-500 hover:bg-gray-700 cursor-pointer';
              } else if (index === question.correctIndex) {
                buttonClass += 'border-green-500 bg-green-900/30';
              } else if (index === selectedAnswer) {
                buttonClass += 'border-red-500 bg-red-900/30';
              } else {
                buttonClass += 'border-gray-700 bg-gray-800 opacity-50';
              }

              return (
                <button
                  key={index}
                  onClick={() => !showResult && submitAnswer(index)}
                  disabled={showResult}
                  className={buttonClass}
                >
                  <span className="text-gray-400 mr-2">{String.fromCharCode(65 + index)}.</span>
                  {option}
                  {showResult && index === question.correctIndex && (
                    <span className="ml-2 text-green-400">✓</span>
                  )}
                  {showResult && index === selectedAnswer && index !== question.correctIndex && (
                    <span className="ml-2 text-red-400">✗</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Result and feedback */}
        {showResult && (
          <div className="space-y-4">
            <CoachingFeedback
              isCorrect={isCorrect}
              sections={[
                {
                  title: isCorrect ? 'Correct!' : 'Not quite',
                  content: question.explanation,
                  type: isCorrect ? 'success' : 'info',
                },
              ]}
              thinkingPrompts={question.thinkingPrompts}
            />

            <button
              onClick={newScenario}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition"
            >
              Next Question
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
