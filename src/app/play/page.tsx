'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Card, createDeck, shuffleDeck, cardsToHandNotation } from '@/lib/deck';
import { Coach, CoachMessage, COACH_PROMPTS, useCoachTyping } from '@/components/Coach';
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

  // Generate seats
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
    heroHand: null, // Hidden initially
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
  const { isTyping, simulateTyping } = useCoachTyping();

  // Add a coach message
  const addMessage = useCallback((
    type: CoachMessage['type'],
    content: string,
    options?: string[],
    waitingForResponse = false
  ) => {
    const newMessage: CoachMessage = {
      id: Date.now().toString(),
      type,
      content,
      options,
      waitingForResponse,
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  // Start a new hand
  const startHand = useCallback(() => {
    const newGame = generateInitialState(game.handNumber + 1);
    setGame(newGame);
    setMessages([]);

    // Coach introduces the situation
    simulateTyping(() => {
      addMessage('coach', `Hand #${newGame.handNumber}. You're in ${newGame.heroPosition}.`);

      setTimeout(() => {
        simulateTyping(() => {
          // Get info about players who act before hero
          const heroIdx = POSITIONS.indexOf(newGame.heroPosition);
          const playersBeforeHero = newGame.seats
            .filter(s => !s.isHero && POSITIONS.indexOf(s.position as Position) < heroIdx)
            .map(s => `${s.position} (${PLAYER_PROFILES[s.playerType].name.split(' ')[0]})`);

          if (playersBeforeHero.length > 0) {
            addMessage('coach', `Players before you: ${playersBeforeHero.join(', ')}.`);
          }

          setTimeout(() => {
            simulateTyping(() => {
              addMessage(
                'coach',
                `Before I show you your cards - what range should ${newGame.heroPosition} be opening? Think about it.`,
                ['Wide range', 'Medium range', 'Tight range', 'Depends on table'],
                true
              );
              setGame(prev => ({ ...prev, phase: 'preflop_think' }));
            }, 60);
          }, 800);
        }, 40);
      }, 600);
    }, 30);
  }, [game.handNumber, addMessage, simulateTyping]);

  // Initialize first hand
  useEffect(() => {
    simulateTyping(() => {
      addMessage('coach', "Let's play some hands. I'm going to challenge you to think through each decision.");
      setTimeout(() => {
        simulateTyping(() => {
          addMessage('coach', "I won't just tell you the answer - I want you to develop your own reads.");
          setTimeout(() => {
            simulateTyping(() => {
              addMessage('coach', "Ready to start?", ['Deal me in'], true);
            }, 40);
          }, 600);
        }, 50);
      }, 600);
    }, 50);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle user responses
  const handleResponse = useCallback((response: string) => {
    addMessage('user', response);

    if (response === 'Deal me in') {
      startHand();
      return;
    }

    if (response === 'Next hand') {
      startHand();
      return;
    }

    if (response === 'Show me the range') {
      setShowReference(true);
      setTimeout(() => {
        simulateTyping(() => {
          addMessage('coach', "Study it. Notice how the range tightens from early position. Now let's continue.", ['Got it'], true);
        }, 40);
      }, 500);
      return;
    }

    if (response === 'Got it') {
      setShowReference(false);
      handlePhaseTransition();
      return;
    }

    // Handle different phases
    switch (game.phase) {
      case 'preflop_think':
        handlePreflopThinkResponse(response);
        break;
      case 'preflop_action':
        handlePreflopActionResponse(response);
        break;
      case 'facing_raise':
        handleFacingRaiseResponse(response);
        break;
      case 'result':
        handleResultResponse(response);
        break;
      case 'lesson':
        // Continue to next hand
        startHand();
        break;
    }
  }, [game.phase, addMessage, startHand, simulateTyping]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePhaseTransition = () => {
    // After showing range, move to action
    const heroSeat = game.seats.find(s => s.isHero);
    if (!heroSeat?.cards) return;

    const hand = heroSeat.cards;
    const notation = cardsToHandNotation(hand);

    setGame(prev => ({ ...prev, heroHand: hand }));

    simulateTyping(() => {
      addMessage('coach', `Alright, let's see what you've got...`);
      setTimeout(() => {
        simulateTyping(() => {
          addMessage('coach', `You look down at ${notation}.`);
          // Determine if facing a raise
          const shouldFaceRaise = Math.random() > 0.6 && game.heroPosition !== 'UTG';

          if (shouldFaceRaise) {
            // Someone raises before us
            const heroIdx = POSITIONS.indexOf(game.heroPosition);
            const earlierPlayers = game.seats.filter(s =>
              !s.isHero && POSITIONS.indexOf(s.position as Position) < heroIdx
            );

            if (earlierPlayers.length > 0) {
              const raiser = earlierPlayers[Math.floor(Math.random() * earlierPlayers.length)];
              const raiseSize = 2.5 + Math.random() * 1.5;

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

              setTimeout(() => {
                simulateTyping(() => {
                  const raiserProfile = PLAYER_PROFILES[raiser.playerType];
                  addMessage(
                    'coach',
                    `${raiser.name} in ${raiser.position} opens to ${raiseSize.toFixed(1)}bb. They've been playing like a ${raiserProfile.name.split(' ')[0]}.`
                  );

                  setTimeout(() => {
                    simulateTyping(() => {
                      addMessage(
                        'coach',
                        `What's their likely range here? And what does that mean for your ${notation}?`,
                        ['Fold', 'Call', '3-Bet'],
                        true
                      );
                    }, 50);
                  }, 600);
                }, 50);
              }, 400);
              return;
            }
          }

          // RFI spot
          setTimeout(() => {
            simulateTyping(() => {
              addMessage('coach', COACH_PROMPTS.pacing.commit, ['Fold', 'Open/Raise'], true);
              setGame(prev => ({ ...prev, phase: 'preflop_action' }));
            }, 30);
          }, 600);
        }, 30);
      }, 500);
    }, 30);
  };

  const handlePreflopThinkResponse = (response: string) => {
    // Acknowledge their thinking about ranges
    simulateTyping(() => {
      const heroPos = game.heroPosition;
      const expectedRange = OPENING_RANGES[heroPos];
      const rangePercent = ((expectedRange.length / 169) * 100).toFixed(0);

      if (response === 'Depends on table') {
        addMessage('coach', `Good thinking - table dynamics matter. But we need a baseline. From ${heroPos}, standard is around ${rangePercent}% of hands.`);
      } else {
        const isCorrect =
          (heroPos === 'UTG' && response === 'Tight range') ||
          (heroPos === 'BTN' && response === 'Wide range') ||
          (['HJ', 'CO', 'SB'].includes(heroPos) && response === 'Medium range');

        if (isCorrect) {
          addMessage('coach', `Right. ${POSITION_NAMES[heroPos]} should be around ${rangePercent}% - that's a ${response.toLowerCase()}.`);
        } else {
          addMessage('coach', `Actually, ${POSITION_NAMES[heroPos]} should be about ${rangePercent}%. Position dictates range width.`);
        }
      }

      setTimeout(() => {
        simulateTyping(() => {
          addMessage('coach', `Want to see the exact range, or trust your reads and see your cards?`, ['Show me the range', 'Show my cards'], true);
        }, 40);
      }, 600);
    }, 50);
  };

  const handlePreflopActionResponse = (response: string) => {
    if (!game.heroHand) return;

    const notation = cardsToHandNotation(game.heroHand);
    const shouldOpen = OPENING_RANGES[game.heroPosition].includes(notation);
    const correctAction = shouldOpen ? 'Open/Raise' : 'Fold';
    const isCorrect = response === correctAction;

    setGame(prev => ({
      ...prev,
      phase: 'result',
      correctAction: shouldOpen ? 'open' : 'fold',
    }));

    simulateTyping(() => {
      if (isCorrect) {
        addMessage('coach', getRandomPrompt(COACH_PROMPTS.feedback.correct));
        setTimeout(() => {
          simulateTyping(() => {
            // Ask follow-up to make sure they understand
            if (shouldOpen) {
              addMessage('coach', `Why does ${notation} work from ${game.heroPosition}?`, ['Good equity', 'Position', 'Both', "I'm not sure"], true);
            } else {
              addMessage('coach', `What would make ${notation} playable?`, ['Better position', 'Weaker opponents', 'Never playable', 'Not sure'], true);
            }
          }, 40);
        }, 600);
      } else {
        addMessage('coach', getRandomPrompt(COACH_PROMPTS.feedback.incorrect));
        setTimeout(() => {
          simulateTyping(() => {
            if (shouldOpen) {
              addMessage('coach', `${notation} is an open from ${game.heroPosition}. It's in the standard range.`);
            } else {
              addMessage('coach', `${notation} is a fold from ${game.heroPosition}. Too many players behind, not enough playability.`);
            }
            setTimeout(() => {
              simulateTyping(() => {
                addMessage('coach', `Let's see the range. Study where ${notation} sits.`, ['Show me the range'], true);
              }, 30);
            }, 600);
          }, 50);
        }, 600);
      }
    }, 40);
  };

  const handleFacingRaiseResponse = (response: string) => {
    if (!game.heroHand || !game.raiserPosition) return;

    const notation = cardsToHandNotation(game.heroHand);
    const threeBetRange = THREE_BET_RANGES[game.heroPosition]?.[game.raiserPosition] || [];
    const openRange = OPENING_RANGES[game.heroPosition];

    let correctAction: 'Fold' | 'Call' | '3-Bet';
    if (threeBetRange.includes(notation)) {
      correctAction = '3-Bet';
    } else if (openRange.includes(notation)) {
      correctAction = 'Call';
    } else {
      correctAction = 'Fold';
    }

    const isCorrect = response === correctAction;

    setGame(prev => ({
      ...prev,
      phase: 'result',
      correctAction: correctAction.toLowerCase().replace('-', '') as any,
    }));

    simulateTyping(() => {
      if (isCorrect) {
        addMessage('coach', getRandomPrompt(COACH_PROMPTS.feedback.correct));
        setTimeout(() => {
          simulateTyping(() => {
            if (correctAction === '3-Bet') {
              addMessage('coach', `${notation} has the equity and blockers to 3-bet here. Against a ${PLAYER_PROFILES[game.raiserType!].name.split(' ')[0]}, this prints money.`);
            } else if (correctAction === 'Call') {
              addMessage('coach', `Calling is correct. ${notation} plays well postflop but isn't quite strong enough to 3-bet for value.`);
            } else {
              addMessage('coach', `Good fold. ${notation} doesn't have the equity to continue against this raise.`);
            }
            setTimeout(() => {
              simulateTyping(() => {
                addMessage('coach', 'Ready for the next hand?', ['Next hand'], true);
                setGame(prev => ({ ...prev, phase: 'lesson' }));
              }, 30);
            }, 600);
          }, 50);
        }, 600);
      } else {
        addMessage('coach', getRandomPrompt(COACH_PROMPTS.feedback.incorrect));
        setTimeout(() => {
          simulateTyping(() => {
            addMessage('coach', `The correct play is ${correctAction}.`);
            if (correctAction === '3-Bet') {
              addMessage('coach', `${notation} has too much equity to just call, and good blockers to their continuing range.`);
            } else if (correctAction === 'Call') {
              addMessage('coach', `${notation} is good enough to see a flop, but 3-betting turns it into a bluff we don't need.`);
            } else {
              addMessage('coach', `Against this range, ${notation} just doesn't have the equity. We'd be burning money.`);
            }
            setTimeout(() => {
              simulateTyping(() => {
                addMessage('coach', 'Let\'s move on.', ['Next hand'], true);
                setGame(prev => ({ ...prev, phase: 'lesson' }));
              }, 30);
            }, 600);
          }, 50);
        }, 600);
      }
    }, 40);
  };

  const handleResultResponse = (response: string) => {
    // Handle follow-up questions after correct/incorrect
    simulateTyping(() => {
      if (response === "I'm not sure" || response === 'Not sure') {
        addMessage('coach', "That's honest. Let's break it down - position gives you information advantage. Equity is your chance to win. Both matter.");
      } else {
        addMessage('coach', "Good. Keep building those mental shortcuts. Pattern recognition comes with reps.");
      }
      setTimeout(() => {
        simulateTyping(() => {
          addMessage('coach', 'Ready for another?', ['Next hand'], true);
          setGame(prev => ({ ...prev, phase: 'lesson' }));
        }, 30);
      }, 600);
    }, 40);
  };

  // Helper to get random prompt
  function getRandomPrompt(prompts: string[]): string {
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="p-4 border-b border-gray-800 flex justify-between items-center">
        <Link href="/" className="text-gray-400 hover:text-white transition">
          ← Back
        </Link>
        <h1 className="text-xl font-bold">Live Table Training</h1>
        <div className="text-sm text-gray-400">
          Hand #{game.handNumber}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row">
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
            <div className="mt-4 p-4 bg-gray-900 rounded-xl">
              <h3 className="text-sm font-semibold mb-2 text-gray-400">
                Opening Range from {game.heroPosition}
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
        <div className="lg:w-1/2 border-t lg:border-t-0 lg:border-l border-gray-800 flex flex-col min-h-[400px]">
          <Coach
            messages={messages}
            onResponse={handleResponse}
            isThinking={isTyping}
            coachName="Coach"
          />
        </div>
      </div>
    </div>
  );
}
