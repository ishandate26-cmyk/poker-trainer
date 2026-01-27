'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Card, createDeck, shuffleDeck, cardsToHandNotation } from '@/lib/deck';
import { Coach, CoachMessage, pick, COACH_VOICE } from '@/components/Coach';
import { LiveTable, TableSeat, generatePlayerName } from '@/components/LiveTable';
import { PLAYER_PROFILES, PlayerType, generateRandomPlayerType } from '@/lib/player-types';
import { OPENING_RANGES, THREE_BET_RANGES, CALLING_RANGES, Position, POSITIONS } from '@/lib/preflop-ranges';
import { evaluateHand } from '@/lib/hand-evaluator';
import { RangeGrid } from '@/components/RangeGrid';

// ============ TYPES ============
type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';
type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

interface PlayerState {
  position: Position;
  name: string;
  playerType: PlayerType;
  stack: number;
  cards: [Card, Card];
  isHero: boolean;
  isFolded: boolean;
  currentBet: number;
  isAllIn: boolean;
}

interface HandState {
  street: Street;
  deck: Card[];
  board: Card[];
  pot: number;
  currentBet: number;
  players: PlayerState[];
  activePlayerIdx: number;
  lastAggressor: number;
  handNumber: number;
  actionHistory: string[];
}

interface GameState {
  hand: HandState | null;
  showRange: boolean;
}

// ============ HELPER FUNCTIONS ============
function getActivePlayers(players: PlayerState[]): PlayerState[] {
  return players.filter(p => !p.isFolded && !p.isAllIn);
}

function getPlayersInHand(players: PlayerState[]): PlayerState[] {
  return players.filter(p => !p.isFolded);
}

function dealCards(deck: Card[], count: number): { cards: Card[], remaining: Card[] } {
  return {
    cards: deck.slice(0, count),
    remaining: deck.slice(count)
  };
}

// Simple villain AI based on player type and hand strength
function getVillainAction(
  villain: PlayerState,
  hand: HandState,
  heroAction: ActionType
): { action: ActionType; amount: number } {
  const profile = PLAYER_PROFILES[villain.playerType];
  const toCall = hand.currentBet - villain.currentBet;
  const potAfterCall = hand.pot + toCall;

  // Evaluate villain's hand if there's a board
  let handStrength = 0.5; // Default for preflop
  if (hand.board.length > 0) {
    const fullHand = [...villain.cards, ...hand.board];
    const evaluation = evaluateHand(fullHand);
    // Normalize hand rank to 0-1 scale (0-9 ranks)
    handStrength = (evaluation.rank / 9) * 0.8 + 0.1;
  } else {
    // Preflop hand strength estimation
    const notation = cardsToHandNotation(villain.cards);
    if (OPENING_RANGES['UTG'].includes(notation)) handStrength = 0.8;
    else if (OPENING_RANGES['CO'].includes(notation)) handStrength = 0.6;
    else if (OPENING_RANGES['BTN'].includes(notation)) handStrength = 0.4;
    else handStrength = 0.2;
  }

  // Adjust based on player type (use midpoint of ranges)
  const aggression = ((profile.aggression.min + profile.aggression.max) / 2) / 5; // Normalize to 0-1
  const vpip = ((profile.vpip.min + profile.vpip.max) / 2) / 100;
  const pfr = ((profile.pfr.min + profile.pfr.max) / 2) / 100;

  const random = Math.random();

  // If facing a bet
  if (toCall > 0) {
    // Fold threshold based on hand strength and player looseness
    const foldThreshold = (1 - vpip) * (1 - handStrength);
    if (random < foldThreshold && handStrength < 0.3) {
      return { action: 'fold', amount: 0 };
    }

    // Raise threshold based on aggression and hand strength
    const raiseThreshold = aggression * handStrength;
    if (random < raiseThreshold && handStrength > 0.5) {
      const raiseAmount = Math.min(
        villain.stack,
        hand.currentBet * 2.5 + (hand.pot * 0.75)
      );
      return { action: 'raise', amount: Math.round(raiseAmount * 10) / 10 };
    }

    // Call
    if (toCall <= villain.stack) {
      return { action: 'call', amount: toCall };
    }
    return { action: 'fold', amount: 0 };
  }

  // If checked to villain
  // Bet threshold based on aggression and hand strength
  const betThreshold = aggression * (handStrength + 0.2);
  if (random < betThreshold && handStrength > 0.3) {
    const betAmount = Math.min(
      villain.stack,
      hand.pot * (0.5 + aggression * 0.5)
    );
    return { action: 'bet', amount: Math.round(betAmount * 10) / 10 };
  }

  return { action: 'check', amount: 0 };
}

// Board texture analysis
function analyzeBoardTexture(board: Card[]): string {
  if (board.length === 0) return '';

  const suits = board.map(c => c.suit);
  const ranks = board.map(c => {
    const rankOrder = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    return rankOrder.indexOf(c.rank);
  }).sort((a, b) => b - a);

  const flushDraw = suits.filter(s => s === suits[0]).length >= 3;
  const paired = new Set(board.map(c => c.rank)).size < board.length;
  const connected = ranks[0] - ranks[ranks.length - 1] <= 4;
  const highCard = board.reduce((h, c) => {
    const rankOrder = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    return rankOrder.indexOf(c.rank) > rankOrder.indexOf(h.rank) ? c : h;
  });

  let texture = '';
  if (ranks[0] >= 10) texture += 'high ';
  else if (ranks[0] >= 7) texture += 'medium ';
  else texture += 'low ';

  if (flushDraw) texture += 'flush-draw ';
  if (connected) texture += 'connected ';
  if (paired) texture += 'paired ';

  return texture.trim() || 'dry';
}

// ============ MAIN COMPONENT ============
export default function PlayPage() {
  const [game, setGame] = useState<GameState>({
    hand: null,
    showRange: false,
  });

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [waitingForAction, setWaitingForAction] = useState(false);
  const messageIdRef = useRef(0);

  // ============ MESSAGING ============
  const addMessage = useCallback((
    type: CoachMessage['type'],
    content: string,
    options?: string[],
    waitingForResponse = false
  ) => {
    messageIdRef.current += 1;
    const newMessage: CoachMessage = {
      id: `msg-${messageIdRef.current}-${Date.now()}`,
      type,
      content,
      options,
      waitingForResponse,
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  const coachSays = useCallback((content: string, options?: string[], wait = false) => {
    setIsThinking(true);
    const delay = 150 + Math.min(content.length * 5, 400);
    setTimeout(() => {
      setIsThinking(false);
      addMessage('coach', content, options, wait);
      if (wait) setWaitingForAction(true);
    }, delay);
  }, [addMessage]);

  // ============ HAND SETUP ============
  const startNewHand = useCallback(() => {
    const deck = shuffleDeck(createDeck());
    const positions: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

    // Pick a random hero position (not BB for more interesting spots)
    const heroPositions: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];
    const heroPosition = heroPositions[Math.floor(Math.random() * heroPositions.length)];

    let deckIdx = 0;
    const players: PlayerState[] = positions.map((pos) => {
      const cards: [Card, Card] = [deck[deckIdx], deck[deckIdx + 1]];
      deckIdx += 2;
      return {
        position: pos,
        name: pos === heroPosition ? 'You' : generatePlayerName(),
        playerType: pos === heroPosition ? 'UNKNOWN' : generateRandomPlayerType(),
        stack: 80 + Math.floor(Math.random() * 120),
        cards,
        isHero: pos === heroPosition,
        isFolded: false,
        currentBet: pos === 'SB' ? 0.5 : pos === 'BB' ? 1 : 0,
        isAllIn: false,
      };
    });

    const handNumber = (game.hand?.handNumber || 0) + 1;

    const newHand: HandState = {
      street: 'preflop',
      deck: deck.slice(deckIdx),
      board: [],
      pot: 1.5, // SB + BB
      currentBet: 1, // BB is 1
      players,
      activePlayerIdx: positions.indexOf('UTG'), // UTG acts first preflop
      lastAggressor: positions.indexOf('BB'),
      handNumber,
      actionHistory: [],
    };

    setGame({ hand: newHand, showRange: false });
    setMessages([]);
    setWaitingForAction(false);

    // Start the action
    setTimeout(() => {
      const heroIdx = players.findIndex(p => p.isHero);
      const notation = cardsToHandNotation(players[heroIdx].cards);

      coachSays(`Hand #${handNumber}. You're in ${heroPosition} with ${notation}.`);

      setTimeout(() => {
        simulatePreflopAction(newHand);
      }, 600);
    }, 300);
  }, [game.hand?.handNumber, coachSays]);

  // ============ PREFLOP ACTION ============
  const simulatePreflopAction = useCallback((hand: HandState) => {
    const heroIdx = hand.players.findIndex(p => p.isHero);
    let currentHand = { ...hand };
    let actionsToHero: string[] = [];

    // Simulate action from UTG to hero
    for (let i = 0; i < heroIdx; i++) {
      const player = currentHand.players[i];
      if (player.isFolded) continue;

      const notation = cardsToHandNotation(player.cards);
      const shouldOpen = OPENING_RANGES[player.position].includes(notation);

      // Simple preflop logic for villains before hero
      if (currentHand.currentBet === 1) { // No raise yet
        const playerPfr = (PLAYER_PROFILES[player.playerType].pfr.min + PLAYER_PROFILES[player.playerType].pfr.max) / 2;
        if (shouldOpen && Math.random() < playerPfr / 100 * 1.5) {
          // Raise
          const raiseSize = 2.5 + Math.random() * 0.5;
          currentHand.players[i] = {
            ...player,
            currentBet: raiseSize,
            stack: player.stack - raiseSize,
          };
          currentHand.currentBet = raiseSize;
          currentHand.pot += raiseSize;
          currentHand.lastAggressor = i;
          actionsToHero.push(`${player.name} (${player.position}) raises to ${raiseSize.toFixed(1)}bb`);
        } else {
          // Fold
          currentHand.players[i] = { ...player, isFolded: true };
          actionsToHero.push(`${player.name} folds`);
        }
      } else {
        // Facing a raise
        const threeBetRange = THREE_BET_RANGES[player.position]?.[currentHand.players[currentHand.lastAggressor].position] || [];
        const callingRange = CALLING_RANGES[player.position]?.[currentHand.players[currentHand.lastAggressor].position] || [];

        if (threeBetRange.includes(notation) && Math.random() < 0.7) {
          // 3-bet
          const threeBetSize = currentHand.currentBet * 3;
          currentHand.players[i] = {
            ...player,
            currentBet: threeBetSize,
            stack: player.stack - threeBetSize,
          };
          currentHand.pot += threeBetSize;
          currentHand.currentBet = threeBetSize;
          currentHand.lastAggressor = i;
          actionsToHero.push(`${player.name} 3-bets to ${threeBetSize.toFixed(1)}bb`);
        } else if (callingRange.includes(notation) && Math.random() < 0.8) {
          // Call
          const callAmount = currentHand.currentBet - player.currentBet;
          currentHand.players[i] = {
            ...player,
            currentBet: currentHand.currentBet,
            stack: player.stack - callAmount,
          };
          currentHand.pot += callAmount;
          actionsToHero.push(`${player.name} calls`);
        } else {
          // Fold
          currentHand.players[i] = { ...player, isFolded: true };
          actionsToHero.push(`${player.name} folds`);
        }
      }
    }

    // Update hand state
    setGame(prev => ({ ...prev, hand: currentHand }));

    // Report action to hero
    if (actionsToHero.length > 0) {
      const summary = actionsToHero.join('. ') + '.';
      coachSays(summary);
    }

    // Now it's hero's turn
    setTimeout(() => {
      promptHeroAction(currentHand);
    }, actionsToHero.length > 0 ? 800 : 200);
  }, [coachSays]);

  // ============ PROMPT HERO ACTION ============
  const promptHeroAction = useCallback((hand: HandState) => {
    const heroIdx = hand.players.findIndex(p => p.isHero);
    const hero = hand.players[heroIdx];
    const toCall = hand.currentBet - hero.currentBet;
    const notation = cardsToHandNotation(hero.cards);

    let options: string[] = [];
    let prompt = '';

    if (hand.street === 'preflop') {
      if (toCall === 0 || (hero.position === 'BB' && toCall === 0)) {
        // Can check (if BB and no raise)
        options = ['Check', 'Raise to 3bb', 'Raise to 4bb'];
        prompt = `Checked to you. Pot: ${hand.pot.toFixed(1)}bb.`;
      } else if (toCall > 0 && hand.currentBet <= 1) {
        // Facing limps or just blinds
        options = ['Fold', 'Call', 'Raise to 3bb', 'Raise to 4bb'];
        prompt = `Action on you. ${toCall.toFixed(1)}bb to call. Pot: ${hand.pot.toFixed(1)}bb.`;
      } else {
        // Facing a raise
        const raiseSize = Math.round(hand.currentBet * 3 * 10) / 10;
        options = ['Fold', `Call ${toCall.toFixed(1)}bb`, `Raise to ${raiseSize}bb`];
        prompt = `${toCall.toFixed(1)}bb to call. Pot: ${hand.pot.toFixed(1)}bb.`;
      }
    } else {
      // Postflop
      const texture = analyzeBoardTexture(hand.board);
      if (toCall === 0) {
        const potBet = Math.round(hand.pot * 0.75 * 10) / 10;
        options = ['Check', `Bet ${potBet}bb (3/4 pot)`, `Bet ${hand.pot.toFixed(1)}bb (pot)`];
        prompt = `${hand.street.charAt(0).toUpperCase() + hand.street.slice(1)}: ${hand.board.map(c => c.rank + c.suit).join(' ')}. Pot: ${hand.pot.toFixed(1)}bb. Board is ${texture}.`;
      } else {
        const raiseSize = Math.round((hand.currentBet * 2.5) * 10) / 10;
        options = ['Fold', `Call ${toCall.toFixed(1)}bb`, `Raise to ${raiseSize}bb`];
        prompt = `${hand.street.charAt(0).toUpperCase() + hand.street.slice(1)}: ${hand.board.map(c => c.rank + c.suit).join(' ')}. ${toCall.toFixed(1)}bb to call. Pot: ${hand.pot.toFixed(1)}bb.`;
      }
    }

    coachSays(prompt, options, true);
  }, [coachSays]);

  // ============ HANDLE HERO ACTION ============
  const handleHeroAction = useCallback((action: string) => {
    if (!game.hand) return;

    setWaitingForAction(false);
    addMessage('user', action);

    const hand = { ...game.hand };
    const heroIdx = hand.players.findIndex(p => p.isHero);
    const hero = { ...hand.players[heroIdx] };
    const toCall = hand.currentBet - hero.currentBet;

    // Parse action
    if (action === 'Fold') {
      hero.isFolded = true;
      hand.players[heroIdx] = hero;
      hand.actionHistory.push('Hero folds');

      setGame(prev => ({ ...prev, hand }));

      coachSays("You fold.");
      setTimeout(() => {
        endHand(hand, 'fold');
      }, 500);
      return;
    }

    if (action === 'Check') {
      hand.actionHistory.push('Hero checks');
      hand.players[heroIdx] = hero;
      setGame(prev => ({ ...prev, hand }));

      coachSays("You check.");
      setTimeout(() => {
        continueAction(hand, heroIdx);
      }, 500);
      return;
    }

    if (action.startsWith('Call')) {
      const callAmount = toCall;
      hero.currentBet = hand.currentBet;
      hero.stack -= callAmount;
      hand.pot += callAmount;
      hand.players[heroIdx] = hero;
      hand.actionHistory.push(`Hero calls ${callAmount.toFixed(1)}bb`);

      setGame(prev => ({ ...prev, hand }));

      coachSays(`You call ${callAmount.toFixed(1)}bb.`);
      setTimeout(() => {
        continueAction(hand, heroIdx);
      }, 500);
      return;
    }

    if (action.startsWith('Bet') || action.startsWith('Raise')) {
      const match = action.match(/[\d.]+/);
      const amount = match ? parseFloat(match[0]) : hand.currentBet * 2.5;

      const totalBet = action.startsWith('Raise') ? amount : amount;
      const additional = totalBet - hero.currentBet;

      hero.currentBet = totalBet;
      hero.stack -= additional;
      hand.pot += additional;
      hand.currentBet = totalBet;
      hand.lastAggressor = heroIdx;
      hand.players[heroIdx] = hero;
      hand.actionHistory.push(`Hero ${action.startsWith('Raise') ? 'raises' : 'bets'} ${totalBet.toFixed(1)}bb`);

      setGame(prev => ({ ...prev, hand }));

      coachSays(`You ${action.startsWith('Raise') ? 'raise' : 'bet'} ${totalBet.toFixed(1)}bb.`);
      setTimeout(() => {
        continueAction(hand, heroIdx);
      }, 500);
      return;
    }
  }, [game.hand, addMessage, coachSays]);

  // ============ CONTINUE ACTION (VILLAIN RESPONSES) ============
  const continueAction = useCallback((hand: HandState, afterPlayerIdx: number) => {
    let currentHand = { ...hand };
    const playersInHand = getPlayersInHand(currentHand.players);

    // If only hero remains, hero wins
    if (playersInHand.length === 1 && playersInHand[0].isHero) {
      endHand(currentHand, 'win');
      return;
    }

    // Continue action after hero
    let responses: string[] = [];
    const heroIdx = currentHand.players.findIndex(p => p.isHero);

    for (let i = afterPlayerIdx + 1; i < currentHand.players.length; i++) {
      const player = currentHand.players[i];
      if (player.isFolded || player.isHero) continue;

      const { action, amount } = getVillainAction(player, currentHand, 'bet');

      if (action === 'fold') {
        currentHand.players[i] = { ...player, isFolded: true };
        responses.push(`${player.name} folds`);
      } else if (action === 'call') {
        const callAmount = currentHand.currentBet - player.currentBet;
        currentHand.players[i] = {
          ...player,
          currentBet: currentHand.currentBet,
          stack: player.stack - callAmount,
        };
        currentHand.pot += callAmount;
        responses.push(`${player.name} calls`);
      } else if (action === 'raise' || action === 'bet') {
        currentHand.players[i] = {
          ...player,
          currentBet: amount,
          stack: player.stack - (amount - player.currentBet),
        };
        currentHand.pot += amount - player.currentBet;
        currentHand.currentBet = amount;
        currentHand.lastAggressor = i;
        responses.push(`${player.name} ${action}s to ${amount.toFixed(1)}bb`);
      } else {
        responses.push(`${player.name} checks`);
      }
    }

    // Check players before hero (if the betting hasn't closed)
    if (currentHand.currentBet > hand.currentBet) {
      // Action reopened, need to go around again
      // For simplicity, just let villains call/fold
      for (let i = 0; i < heroIdx; i++) {
        const player = currentHand.players[i];
        if (player.isFolded || player.currentBet >= currentHand.currentBet) continue;

        const toCall = currentHand.currentBet - player.currentBet;
        if (Math.random() < 0.4) {
          currentHand.players[i] = { ...player, isFolded: true };
          responses.push(`${player.name} folds`);
        } else {
          currentHand.players[i] = {
            ...player,
            currentBet: currentHand.currentBet,
            stack: player.stack - toCall,
          };
          currentHand.pot += toCall;
          responses.push(`${player.name} calls`);
        }
      }
    }

    setGame(prev => ({ ...prev, hand: currentHand }));

    if (responses.length > 0) {
      coachSays(responses.join('. ') + '.');
    }

    // Check if action needs to come back to hero
    const heroNeedsToAct = currentHand.currentBet > currentHand.players[heroIdx].currentBet &&
                          !currentHand.players[heroIdx].isFolded;

    if (heroNeedsToAct) {
      setTimeout(() => {
        promptHeroAction(currentHand);
      }, 600);
      return;
    }

    // Check if we need to deal next street or showdown
    const remaining = getPlayersInHand(currentHand.players);
    if (remaining.length === 1) {
      setTimeout(() => {
        endHand(currentHand, remaining[0].isHero ? 'win' : 'lose');
      }, 600);
      return;
    }

    // Move to next street
    setTimeout(() => {
      dealNextStreet(currentHand);
    }, 800);
  }, [coachSays]);

  // ============ DEAL NEXT STREET ============
  const dealNextStreet = useCallback((hand: HandState) => {
    let currentHand = { ...hand };

    // Reset current bets for new street
    currentHand.players = currentHand.players.map(p => ({ ...p, currentBet: 0 }));
    currentHand.currentBet = 0;

    if (currentHand.street === 'preflop') {
      // Deal flop
      const { cards, remaining } = dealCards(currentHand.deck, 3);
      currentHand.board = cards;
      currentHand.deck = remaining;
      currentHand.street = 'flop';
    } else if (currentHand.street === 'flop') {
      // Deal turn
      const { cards, remaining } = dealCards(currentHand.deck, 1);
      currentHand.board = [...currentHand.board, ...cards];
      currentHand.deck = remaining;
      currentHand.street = 'turn';
    } else if (currentHand.street === 'turn') {
      // Deal river
      const { cards, remaining } = dealCards(currentHand.deck, 1);
      currentHand.board = [...currentHand.board, ...cards];
      currentHand.deck = remaining;
      currentHand.street = 'river';
    } else if (currentHand.street === 'river') {
      // Showdown
      currentHand.street = 'showdown';
      setGame(prev => ({ ...prev, hand: currentHand }));
      setTimeout(() => {
        showdown(currentHand);
      }, 500);
      return;
    }

    setGame(prev => ({ ...prev, hand: currentHand }));

    const boardStr = currentHand.board.map(c => c.rank + c.suit).join(' ');
    const texture = analyzeBoardTexture(currentHand.board);

    coachSays(`${currentHand.street.charAt(0).toUpperCase() + currentHand.street.slice(1)}: ${boardStr}. ${texture} board.`);

    // Find first active player after button (SB or first non-folded)
    const activeOrder = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
    let firstToAct = currentHand.players.findIndex(p =>
      !p.isFolded && activeOrder.indexOf(p.position) ===
      Math.min(...currentHand.players.filter(x => !x.isFolded).map(x => activeOrder.indexOf(x.position)))
    );

    // Simulate action to hero if hero isn't first
    const heroIdx = currentHand.players.findIndex(p => p.isHero);

    if (firstToAct !== heroIdx && !currentHand.players[heroIdx].isFolded) {
      setTimeout(() => {
        simulatePostflopToHero(currentHand, firstToAct, heroIdx);
      }, 600);
    } else {
      setTimeout(() => {
        promptHeroAction(currentHand);
      }, 600);
    }
  }, [coachSays]);

  // ============ SIMULATE POSTFLOP ACTION TO HERO ============
  const simulatePostflopToHero = useCallback((hand: HandState, fromIdx: number, heroIdx: number) => {
    let currentHand = { ...hand };
    let actions: string[] = [];

    for (let i = fromIdx; i < heroIdx; i++) {
      const player = currentHand.players[i];
      if (player.isFolded) continue;

      const { action, amount } = getVillainAction(player, currentHand, 'check');

      if (action === 'bet') {
        currentHand.players[i] = {
          ...player,
          currentBet: amount,
          stack: player.stack - amount,
        };
        currentHand.pot += amount;
        currentHand.currentBet = amount;
        currentHand.lastAggressor = i;
        actions.push(`${player.name} bets ${amount.toFixed(1)}bb`);
      } else {
        actions.push(`${player.name} checks`);
      }
    }

    setGame(prev => ({ ...prev, hand: currentHand }));

    if (actions.length > 0) {
      coachSays(actions.join('. ') + '.');
    }

    setTimeout(() => {
      promptHeroAction(currentHand);
    }, 600);
  }, [coachSays]);

  // ============ SHOWDOWN ============
  const showdown = useCallback((hand: HandState) => {
    const playersInHand = getPlayersInHand(hand.players);
    const heroIdx = hand.players.findIndex(p => p.isHero);
    const hero = hand.players[heroIdx];

    if (playersInHand.length < 2) {
      endHand(hand, playersInHand[0]?.isHero ? 'win' : 'lose');
      return;
    }

    // Evaluate all hands
    const evaluations = playersInHand.map(p => ({
      player: p,
      hand: evaluateHand([...p.cards, ...hand.board]),
    }));

    // Sort by hand score (descending) - score handles all comparisons
    evaluations.sort((a, b) => b.hand.score - a.hand.score);

    const winner = evaluations[0];
    const heroEval = evaluations.find(e => e.player.isHero);

    // Show all hands
    let showdownMsg = 'Showdown!\n';
    evaluations.forEach(e => {
      showdownMsg += `${e.player.name} shows ${e.player.cards[0].rank}${e.player.cards[0].suit} ${e.player.cards[1].rank}${e.player.cards[1].suit} - ${e.hand.rankName}\n`;
    });

    showdownMsg += `\n${winner.player.name} wins ${hand.pot.toFixed(1)}bb with ${winner.hand.rankName}!`;

    coachSays(showdownMsg);

    setTimeout(() => {
      endHand(hand, winner.player.isHero ? 'win' : 'lose');
    }, 1000);
  }, [coachSays]);

  // ============ END HAND ============
  const endHand = useCallback((hand: HandState, result: 'win' | 'lose' | 'fold') => {
    const heroIdx = hand.players.findIndex(p => p.isHero);
    const hero = hand.players[heroIdx];
    const notation = cardsToHandNotation(hero.cards);

    let summary = '';
    if (result === 'win') {
      summary = `You win ${hand.pot.toFixed(1)}bb!`;
    } else if (result === 'lose') {
      summary = `You lose this hand.`;
    } else {
      summary = `You folded ${notation}.`;
    }

    coachSays(summary);

    setTimeout(() => {
      let feedback = '';
      if (result === 'fold') {
        feedback = `Folding can be the right play. Remember: protecting your stack for better spots is part of winning poker. Would ${notation} have been profitable to continue with here?`;
      } else if (result === 'win') {
        feedback = `Nice pot! Let's review: did you extract maximum value, or could you have bet bigger at any point?`;
      } else {
        feedback = `Tough one. Let's analyze: was there a point where you could have gotten away cheaper, or was it just a cooler?`;
      }
      coachSays(feedback, ['Deal next hand', 'Show analysis'], true);
    }, 800);
  }, [coachSays]);

  // ============ INITIALIZE ============
  useEffect(() => {
    coachSays("Let's play some hands. Full simulation - we'll go preflop to showdown.");
    setTimeout(() => {
      coachSays("Ready?", ['Deal me in'], true);
    }, 800);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ============ RESPONSE HANDLER ============
  const handleResponse = useCallback((response: string, isCustom = false) => {
    if (response === 'Deal me in' || response === 'Deal next hand') {
      startNewHand();
      return;
    }

    if (response === 'Show analysis') {
      if (game.hand) {
        const history = game.hand.actionHistory.join('\n');
        coachSays(`Hand review:\n${history || 'No actions recorded'}\n\nKey takeaway: ${game.hand.pot > 10 ? 'This was a significant pot - make sure your big bets are for value or as well-timed bluffs.' : 'Small pot poker - good pot control.'}`);
        setTimeout(() => {
          coachSays("Ready for another?", ['Deal next hand'], true);
        }, 1000);
      }
      return;
    }

    if (waitingForAction && !isCustom) {
      handleHeroAction(response);
      return;
    }

    // Handle custom questions
    if (isCustom && game.hand) {
      const q = response.toLowerCase();
      const hero = game.hand.players.find(p => p.isHero);
      const notation = hero ? cardsToHandNotation(hero.cards) : '';

      if (q.includes('should') || q.includes('what do')) {
        coachSays(`With ${notation} here, think about: (1) Your hand strength relative to the board, (2) What hands villain could have, (3) Whether you're betting for value or as a bluff.`);
      } else if (q.includes('why') || q.includes('explain')) {
        coachSays(`The key factors: pot odds, your equity, and villain's likely range. On this ${game.hand.street}, ${analyzeBoardTexture(game.hand.board)} board favors ${game.hand.board.length > 0 ? 'hands that connect with high cards or draws' : 'premium holdings'}.`);
      } else {
        coachSays(`Good question. With ${notation}, consider how it connects with the board and what hands you're trying to get value from or make fold.`);
      }
    }
  }, [game.hand, waitingForAction, startNewHand, handleHeroAction, coachSays]);

  // ============ RENDER ============
  const hand = game.hand;
  const seats: TableSeat[] = hand ? hand.players.map(p => ({
    position: p.position,
    playerType: p.playerType,
    stack: p.stack,
    isHero: p.isHero,
    cards: p.isHero ? p.cards : undefined,
    isFolded: p.isFolded,
    currentBet: p.currentBet,
    isActive: false,
    name: p.name,
  })) : [];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="p-4 border-b border-gray-800 flex justify-between items-center">
        <Link href="/" className="text-gray-400 hover:text-white transition text-sm">← Back</Link>
        <h1 className="text-lg font-bold">Live Training</h1>
        <div className="text-sm text-gray-500">
          {hand && `#${hand.handNumber} - ${hand.street}`}
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="lg:w-1/2 p-4 flex flex-col">
          <LiveTable
            seats={seats}
            board={hand?.board || []}
            pot={hand?.pot || 0}
            heroPosition={hand?.players.find(p => p.isHero)?.position || 'BTN'}
          />
        </div>

        <div className="lg:w-1/2 flex-1 border-t lg:border-t-0 lg:border-l border-gray-800 flex flex-col min-h-[350px]">
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
