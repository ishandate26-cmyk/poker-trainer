'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Card, createDeck, shuffleDeck, cardsToHandNotation } from '@/lib/deck';
import { Coach, CoachMessage, pick, COACH_VOICE, answerQuestion } from '@/components/Coach';
import { LiveTable, TableSeat, generatePlayerName } from '@/components/LiveTable';
import { PLAYER_PROFILES, PlayerType, generateRandomPlayerType } from '@/lib/player-types';
import { OPENING_RANGES, THREE_BET_RANGES, Position, POSITIONS, POSITION_NAMES } from '@/lib/preflop-ranges';
import { RangeGrid } from '@/components/RangeGrid';

type GamePhase = 'intro' | 'preflop_think' | 'preflop_action' | 'facing_raise' | 'result' | 'lesson';

interface GameState {
  phase: GamePhase;
  heroHand: [Card, Card] | null;
  heroPosition: Position;
  board: Card[];
  pot: number;
  seats: TableSeat[];
  raiserPosition?: Position;
  raiserType?: PlayerType;
  correctAction: 'fold' | 'open' | 'call' | '3bet';
  handNumber: number;
}

function generateInitialState(handNumber: number): GameState {
  const deck = shuffleDeck(createDeck());
  const positions: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const heroPosition = positions[Math.floor(Math.random() * positions.length)];

  const seats: TableSeat[] = positions.map((pos, i) => ({
    position: pos,
    playerType: pos === heroPosition ? 'UNKNOWN' : generateRandomPlayerType(),
    stack: 80 + Math.floor(Math.random() * 120),
    isHero: pos === heroPosition,
    cards: pos === heroPosition ? [deck[i * 2], deck[i * 2 + 1]] as [Card, Card] : undefined,
    isFolded: false,
    currentBet: pos === 'SB' ? 0.5 : pos === 'BB' ? 1 : 0,
    isActive: false,
    name: pos === heroPosition ? 'Hero' : generatePlayerName(),
  }));

  return {
    phase: 'intro',
    heroHand: null,
    heroPosition,
    board: [],
    pot: 1.5,
    seats,
    correctAction: 'fold',
    handNumber,
  };
}

export default function PlayPage() {
  const [game, setGame] = useState<GameState>(() => generateInitialState(1));
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [showReference, setShowReference] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const addMessage = useCallback((
    type: CoachMessage['type'],
    content: string,
    options?: string[],
    waitingForResponse = false
  ) => {
    const newMessage: CoachMessage = {
      id: Date.now().toString() + Math.random(),
      type,
      content,
      options,
      waitingForResponse,
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  const coachSays = useCallback((content: string, options?: string[], wait = false) => {
    setIsThinking(true);
    const delay = 300 + Math.min(content.length * 15, 1200) + Math.random() * 400;
    setTimeout(() => {
      setIsThinking(false);
      addMessage('coach', content, options, wait);
    }, delay);
  }, [addMessage]);

  // Quick coach response (no typing delay for follow-ups)
  const coachQuick = useCallback((content: string, options?: string[], wait = false) => {
    setIsThinking(true);
    setTimeout(() => {
      setIsThinking(false);
      addMessage('coach', content, options, wait);
    }, 400);
  }, [addMessage]);

  const startHand = useCallback(() => {
    const newGame = generateInitialState(game.handNumber + 1);
    setGame(newGame);
    setMessages([]);
    setShowReference(false);

    coachSays(`Hand #${newGame.handNumber}. You're ${newGame.heroPosition}.`);

    setTimeout(() => {
      const heroIdx = POSITIONS.indexOf(newGame.heroPosition);
      const playersBefore = newGame.seats
        .filter(s => !s.isHero && POSITIONS.indexOf(s.position as Position) < heroIdx);

      if (playersBefore.length > 0) {
        const playersStr = playersBefore.map(s => {
          const shortType = PLAYER_PROFILES[s.playerType].name.split('-')[0].split(' ')[0];
          return `${s.position} (${shortType})`;
        }).join(', ');
        coachSays(`Players to act: ${playersStr}`);
      }

      setTimeout(() => {
        coachSays(
          `Before I show your cards - what should ${newGame.heroPosition} be opening?`,
          ['Tight', 'Medium', 'Wide', 'Depends'],
          true
        );
        setGame(prev => ({ ...prev, phase: 'preflop_think' }));
      }, 1200);
    }, 1000);
  }, [game.handNumber, coachSays]);

  // Initialize
  useEffect(() => {
    coachSays("Let's play. I'll ask you questions - you think, then decide.");
    setTimeout(() => {
      coachSays("Ask me anything if you're stuck. Ready?", ['Deal me in'], true);
    }, 1500);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResponse = useCallback((response: string, isCustomQuestion = false) => {
    addMessage('user', response);

    // Handle free-form questions
    if (isCustomQuestion) {
      const ctx = {
        hand: game.heroHand ? cardsToHandNotation(game.heroHand) : undefined,
        position: game.heroPosition,
        villainType: game.raiserType,
        action: game.correctAction,
      };

      const answer = answerQuestion(response, ctx);
      if (answer) {
        coachSays(answer);
        // After answering, prompt to continue if we were waiting
        setTimeout(() => {
          if (game.phase === 'preflop_think') {
            coachQuick("Anyway - what range from here?", ['Tight', 'Medium', 'Wide', 'Depends'], true);
          } else if (game.phase === 'preflop_action') {
            const hand = game.heroHand ? cardsToHandNotation(game.heroHand) : 'your hand';
            coachQuick(`Back to it. ${hand}. What's the play?`, ['Fold', 'Open'], true);
          } else if (game.phase === 'facing_raise') {
            coachQuick("So what are you doing?", ['Fold', 'Call', '3-Bet'], true);
          } else if (game.phase === 'lesson' || game.phase === 'result') {
            coachQuick("Next hand?", ['Deal'], true);
          }
        }, 1500);
        return;
      } else {
        // Generic response to unknown question
        coachSays("Good question. Let's keep it simple though - make your read, then we'll talk.");
        setTimeout(() => {
          if (game.phase === 'preflop_think') {
            coachQuick("Range from here?", ['Tight', 'Medium', 'Wide', 'Depends'], true);
          }
        }, 1200);
        return;
      }
    }

    // Handle button clicks
    if (response === 'Deal me in' || response === 'Deal' || response === 'Next hand') {
      startHand();
      return;
    }

    if (response === 'Show range') {
      setShowReference(true);
      coachQuick("Study it. Notice how it changes by position.", ['Got it'], true);
      return;
    }

    if (response === 'Got it') {
      setShowReference(false);
      transitionToAction();
      return;
    }

    // Phase-specific handling
    switch (game.phase) {
      case 'preflop_think':
        handlePreflopThink(response);
        break;
      case 'preflop_action':
        handlePreflopAction(response);
        break;
      case 'facing_raise':
        handleFacingRaise(response);
        break;
      case 'result':
        handleResult(response);
        break;
      case 'lesson':
        startHand();
        break;
    }
  }, [game, addMessage, coachSays, coachQuick, startHand]); // eslint-disable-line react-hooks/exhaustive-deps

  const transitionToAction = () => {
    const heroSeat = game.seats.find(s => s.isHero);
    if (!heroSeat?.cards) return;

    const hand = heroSeat.cards;
    const notation = cardsToHandNotation(hand);
    setGame(prev => ({ ...prev, heroHand: hand }));

    coachSays(`Alright. You look down at ${notation}.`);

    setTimeout(() => {
      // Decide if facing a raise
      const shouldFaceRaise = Math.random() > 0.55 && game.heroPosition !== 'UTG';
      const heroIdx = POSITIONS.indexOf(game.heroPosition);
      const earlierPlayers = game.seats.filter(s =>
        !s.isHero && POSITIONS.indexOf(s.position as Position) < heroIdx
      );

      if (shouldFaceRaise && earlierPlayers.length > 0) {
        const raiser = earlierPlayers[Math.floor(Math.random() * earlierPlayers.length)];
        const raiseSize = 2.5 + Math.random() * 1.5;
        const shortType = PLAYER_PROFILES[raiser.playerType].name.split('-')[0].split(' ')[0];

        setGame(prev => ({
          ...prev,
          phase: 'facing_raise',
          raiserPosition: raiser.position as Position,
          raiserType: raiser.playerType,
          pot: prev.pot + raiseSize,
          seats: prev.seats.map(s =>
            s.position === raiser.position
              ? { ...s, lastAction: `RAISE ${raiseSize.toFixed(1)}`, currentBet: raiseSize }
              : s
          ),
        }));

        coachSays(`${raiser.name} (${shortType}) opens to ${raiseSize.toFixed(1)}bb.`);
        setTimeout(() => {
          coachSays("What's the play?", ['Fold', 'Call', '3-Bet'], true);
        }, 800);
      } else {
        setGame(prev => ({ ...prev, phase: 'preflop_action' }));
        coachSays("Action on you.", ['Fold', 'Open'], true);
      }
    }, 1000);
  };

  const handlePreflopThink = (response: string) => {
    const expectedRange = OPENING_RANGES[game.heroPosition];
    const pct = Math.round((expectedRange.length / 169) * 100);

    // Example hands for this position
    const exampleHands = expectedRange.slice(0, 5).join(', ');
    const borderlineHand = expectedRange[expectedRange.length - 3] || 'suited connectors';

    const isRight =
      (game.heroPosition === 'UTG' && response === 'Tight') ||
      (game.heroPosition === 'BTN' && response === 'Wide') ||
      (['HJ', 'CO', 'SB'].includes(game.heroPosition) && response === 'Medium') ||
      response === 'Depends';

    if (response === 'Depends') {
      coachSays(`Fair, but let's set a baseline. From ${game.heroPosition}, open about ${pct}% - hands like ${exampleHands}. ${borderlineHand} is borderline.`);
    } else if (isRight) {
      coachSays(`${pick(COACH_VOICE.good)} ~${pct}% from ${game.heroPosition}. Example hands: ${exampleHands}.`);
    } else {
      coachSays(`${pick(COACH_VOICE.notQuite)} From ${game.heroPosition} it's ~${pct}%. That's hands like ${exampleHands}. Borderline: ${borderlineHand}.`);
    }

    setTimeout(() => {
      coachSays("Want the chart, or just show me your cards?", ['Show range', 'Show cards'], true);
    }, 1000);
  };

  const handlePreflopAction = (response: string) => {
    if (response === 'Show cards') {
      transitionToAction();
      return;
    }

    if (!game.heroHand) return;

    const notation = cardsToHandNotation(game.heroHand);
    const shouldOpen = OPENING_RANGES[game.heroPosition].includes(notation);
    const isCorrect = (response === 'Open' && shouldOpen) || (response === 'Fold' && !shouldOpen);

    setGame(prev => ({
      ...prev,
      phase: 'result',
      correctAction: shouldOpen ? 'open' : 'fold',
    }));

    if (isCorrect) {
      coachSays(`${pick(COACH_VOICE.good)}`);
      setTimeout(() => {
        if (shouldOpen) {
          coachQuick(`${notation} plays from ${game.heroPosition}. You've got equity and position works for you.`);
        } else {
          coachQuick(`${notation} is a fold here. Not enough equity, too many players behind.`);
        }
        setTimeout(() => {
          coachQuick("Next?", ['Deal', 'Why?'], true);
          setGame(prev => ({ ...prev, phase: 'lesson' }));
        }, 1000);
      }, 600);
    } else {
      coachSays(`${pick(COACH_VOICE.notQuite)}`);
      setTimeout(() => {
        if (shouldOpen) {
          coachQuick(`${notation} is actually an open from ${game.heroPosition}. It's in the standard range.`);
        } else {
          coachQuick(`${notation} is a fold from ${game.heroPosition}. I know it looks okay but the math doesn't work.`);
        }
        setTimeout(() => {
          coachQuick("Want to see where it sits in the range?", ['Show range', 'Next hand'], true);
        }, 1000);
      }, 600);
    }
  };

  const handleFacingRaise = (response: string) => {
    if (!game.heroHand || !game.raiserPosition) return;

    const notation = cardsToHandNotation(game.heroHand);
    const threeBetRange = THREE_BET_RANGES[game.heroPosition]?.[game.raiserPosition] || [];
    const openRange = OPENING_RANGES[game.heroPosition];

    let correct: string;
    let correctAction: 'fold' | 'call' | '3bet';
    if (threeBetRange.includes(notation)) {
      correct = '3-Bet';
      correctAction = '3bet';
    } else if (openRange.includes(notation)) {
      correct = 'Call';
      correctAction = 'call';
    } else {
      correct = 'Fold';
      correctAction = 'fold';
    }

    const isCorrect = response === correct;

    setGame(prev => ({
      ...prev,
      phase: 'result',
      correctAction,
    }));

    if (isCorrect) {
      coachSays(`${pick(COACH_VOICE.good)}`);
      setTimeout(() => {
        const shortType = PLAYER_PROFILES[game.raiserType!].name.split('-')[0].split(' ')[0];
        if (correct === '3-Bet') {
          coachQuick(`Against a ${shortType}, ${notation} has the goods to 3-bet. You want action.`);
        } else if (correct === 'Call') {
          coachQuick(`Calling is right. ${notation} plays but isn't strong enough to 3-bet for value.`);
        } else {
          coachQuick(`Good fold. ${notation} doesn't have the equity against their range.`);
        }
        setTimeout(() => {
          coachQuick("Again?", ['Deal'], true);
          setGame(prev => ({ ...prev, phase: 'lesson' }));
        }, 1000);
      }, 600);
    } else {
      coachSays(`${pick(COACH_VOICE.notQuite)} The play is ${correct.toLowerCase()}.`);
      setTimeout(() => {
        const shortType = PLAYER_PROFILES[game.raiserType!].name.split('-')[0].split(' ')[0];
        if (correct === '3-Bet') {
          coachQuick(`${notation} crushes a ${shortType}'s range here. 3-bet and get value.`);
        } else if (correct === 'Call') {
          coachQuick(`${notation} isn't strong enough to 3-bet but too good to fold. Just call.`);
        } else {
          coachQuick(`I know ${notation} looks okay but against this range you're crushed. Let it go.`);
        }
        setTimeout(() => {
          coachQuick("Next one?", ['Deal', 'Explain more'], true);
          setGame(prev => ({ ...prev, phase: 'lesson' }));
        }, 1000);
      }, 600);
    }
  };

  const handleResult = (response: string) => {
    if (response === 'Why?' || response === 'Explain more') {
      const notation = game.heroHand ? cardsToHandNotation(game.heroHand) : 'the hand';
      if (game.correctAction === 'fold') {
        coachSays(`${notation} from ${game.heroPosition}: imagine playing this 100 times. You'll win some, but lose more. Example: K8o UTG - someone behind probably has KQ, KJ, AK. You're dominated. Folding saves those chips for better spots.`);
      } else if (game.correctAction === 'open') {
        coachSays(`${notation} from ${game.heroPosition}: this hand has "playability." Example: if you have A5s and flop a flush draw, you can win a big pot. Even if you miss, ace-high sometimes wins. Enough upside to raise.`);
      } else if (game.correctAction === '3bet') {
        coachSays(`${notation} crushes their opening range. Example: they open with KJo, you have AK. You're way ahead. 3-bet to get money in while you're winning. If they fold, you take the pot - also fine.`);
      } else {
        coachSays(`${notation} is good enough to see a flop but not to 3-bet. Example: 88 vs a raise - you're flipping against overcards, crushed by bigger pairs. Call, try to hit a set (another 8), then win big.`);
      }
      setTimeout(() => {
        coachQuick("Make sense?", ['Yeah', 'Not really'], true);
      }, 1200);
      return;
    }

    if (response === 'Not really') {
      coachSays(`Okay, even simpler. Example: you have 72o (worst hand). Would you put money in? No - you'll lose. You have AA (best hand). Put money in? Yes - you'll win. Every hand is somewhere between. We're learning which ones are closer to AA (play) vs 72 (fold).`);
      setTimeout(() => {
        coachQuick("Keep playing, you'll get the feel.", ['Deal'], true);
        setGame(prev => ({ ...prev, phase: 'lesson' }));
      }, 1000);
      return;
    }

    if (response === 'Yeah' || response === 'Next hand') {
      startHand();
      return;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="p-4 border-b border-gray-800 flex justify-between items-center">
        <Link href="/" className="text-gray-400 hover:text-white transition text-sm">
          ← Back
        </Link>
        <h1 className="text-lg font-bold">Live Training</h1>
        <div className="text-sm text-gray-500">
          #{game.handNumber}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Table view */}
        <div className="lg:w-1/2 p-4 flex flex-col">
          <LiveTable
            seats={game.seats.map(s => ({
              ...s,
              cards: s.isHero && game.heroHand ? game.heroHand : s.cards,
            }))}
            board={game.board}
            pot={game.pot}
            heroPosition={game.heroPosition}
          />

          {/* Reference panel */}
          {showReference && (
            <div className="mt-4 p-4 bg-gray-900 rounded-xl max-h-[300px] overflow-auto">
              <h3 className="text-sm font-semibold mb-2 text-gray-400">
                {game.heroPosition} Opening Range
              </h3>
              <RangeGrid
                selectedHands={OPENING_RANGES[game.heroPosition]}
                readOnly
                heroHand={game.heroHand ? cardsToHandNotation(game.heroHand) : undefined}
              />
            </div>
          )}
        </div>

        {/* Coach chat */}
        <div className="lg:w-1/2 flex-1 border-t lg:border-t-0 lg:border-l border-gray-800 flex flex-col min-h-[350px] lg:min-h-0">
          <Coach
            messages={messages}
            onResponse={handleResponse}
            isThinking={isThinking}
            allowFreeText={true}
          />
        </div>
      </div>
    </div>
  );
}
