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
  lastAggressorPosition?: Position;
  handNumber: number;
  actionHistory: string[];
}

interface GameState {
  hand: HandState | null;
  showRange: boolean;
}

// ============ HELPER FUNCTIONS ============
function getPlayersInHand(players: PlayerState[]): PlayerState[] {
  return players.filter(p => !p.isFolded);
}

function dealCards(deck: Card[], count: number): { cards: Card[], remaining: Card[] } {
  return {
    cards: deck.slice(0, count),
    remaining: deck.slice(count)
  };
}

// Analyze hero's hand strength on current board
function analyzeHandStrength(heroCards: [Card, Card], board: Card[]): {
  made: string;
  draws: string[];
  strength: 'strong' | 'medium' | 'weak' | 'draw';
} {
  if (board.length === 0) {
    const notation = cardsToHandNotation(heroCards);
    const isPair = heroCards[0].rank === heroCards[1].rank;
    const isSuited = heroCards[0].suit === heroCards[1].suit;
    const highRanks = ['A', 'K', 'Q', 'J', 'T'];
    const hasHighCard = highRanks.includes(heroCards[0].rank) || highRanks.includes(heroCards[1].rank);

    if (isPair && ['A', 'K', 'Q', 'J', 'T'].includes(heroCards[0].rank)) {
      return { made: 'premium pair', draws: [], strength: 'strong' };
    }
    if (isPair) {
      return { made: 'pocket pair', draws: [], strength: 'medium' };
    }
    if (notation === 'AKs' || notation === 'AKo') {
      return { made: 'big slick', draws: [], strength: 'strong' };
    }
    if (hasHighCard && isSuited) {
      return { made: 'suited broadway', draws: ['flush potential'], strength: 'medium' };
    }
    if (hasHighCard) {
      return { made: 'high cards', draws: [], strength: 'medium' };
    }
    if (isSuited) {
      return { made: 'suited cards', draws: ['flush potential'], strength: 'weak' };
    }
    return { made: 'speculative', draws: [], strength: 'weak' };
  }

  const fullHand = [...heroCards, ...board];
  const evaluation = evaluateHand(fullHand);
  const draws: string[] = [];

  // Check for draws
  const suits = fullHand.map(c => c.suit);
  const suitCounts = suits.reduce((acc, s) => {
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const maxSuitCount = Math.max(...Object.values(suitCounts));

  if (maxSuitCount === 4) draws.push('flush draw');

  const rankValues = fullHand.map(c => {
    const rankOrder = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    return rankOrder.indexOf(c.rank);
  }).sort((a, b) => a - b);

  // Check for straight draws (simplified)
  const uniqueRanks = [...new Set(rankValues)];
  for (let i = 0; i < uniqueRanks.length - 3; i++) {
    if (uniqueRanks[i + 3] - uniqueRanks[i] <= 4) {
      if (uniqueRanks[i + 3] - uniqueRanks[i] === 3) draws.push('open-ended straight draw');
      else if (uniqueRanks[i + 3] - uniqueRanks[i] === 4) draws.push('gutshot');
      break;
    }
  }

  let strength: 'strong' | 'medium' | 'weak' | 'draw' = 'weak';
  if (evaluation.rank >= 3) strength = 'strong'; // trips or better
  else if (evaluation.rank >= 1) strength = 'medium'; // pair or two pair
  else if (draws.length > 0) strength = 'draw';

  return {
    made: evaluation.rankName,
    draws,
    strength
  };
}

// Get coaching advice based on situation
function getCoachingAdvice(
  hand: HandState,
  hero: PlayerState,
  handAnalysis: ReturnType<typeof analyzeHandStrength>,
  toCall: number
): string {
  const notation = cardsToHandNotation(hero.cards);
  const villains = hand.players.filter(p => !p.isFolded && !p.isHero);
  const inPosition = POSITIONS.indexOf(hero.position) > Math.max(...villains.map(v => POSITIONS.indexOf(v.position)));

  let advice = '';

  // Hand strength context
  advice += `Your ${notation} is ${handAnalysis.made}`;
  if (handAnalysis.draws.length > 0) {
    advice += ` with ${handAnalysis.draws.join(' and ')}`;
  }
  advice += '. ';

  // Position context
  if (hand.street !== 'preflop') {
    advice += inPosition ? 'You have position. ' : 'You\'re out of position. ';
  }

  // Board texture and villain context
  if (hand.board.length > 0) {
    const texture = analyzeBoardTexture(hand.board);
    if (texture.includes('flush')) {
      advice += 'Flush possible on board - beware if you don\'t have it. ';
    }
    if (texture.includes('paired')) {
      advice += 'Paired board - full houses possible. ';
    }
  }

  // Villain tendencies
  if (villains.length > 0) {
    const mainVillain = villains[0];
    const profile = PLAYER_PROFILES[mainVillain.playerType];
    if (mainVillain.playerType === 'NIT') {
      advice += `${mainVillain.name} is tight - if they bet big, they likely have it. `;
    } else if (mainVillain.playerType === 'LAG' || mainVillain.playerType === 'MANIAC') {
      advice += `${mainVillain.name} is aggressive - they could be bluffing. `;
    } else if (mainVillain.playerType === 'FISH' || mainVillain.playerType === 'CALLING_STATION') {
      advice += `${mainVillain.name} calls too much - value bet, don't bluff. `;
    }
  }

  // Action recommendation
  if (toCall > 0) {
    const potOdds = (toCall / (hand.pot + toCall) * 100).toFixed(0);
    advice += `Pot odds: ${potOdds}%. `;

    if (handAnalysis.strength === 'strong') {
      advice += 'Consider raising for value.';
    } else if (handAnalysis.strength === 'medium') {
      advice += 'Calling is reasonable if pot odds are good.';
    } else if (handAnalysis.strength === 'draw') {
      const neededOdds = handAnalysis.draws.includes('flush draw') ? 35 : 17;
      advice += parseInt(potOdds) <= neededOdds ? 'Good odds for your draw.' : 'Odds not great for chasing.';
    } else {
      advice += 'Weak hand - fold unless you can bluff.';
    }
  } else {
    if (handAnalysis.strength === 'strong') {
      advice += 'Strong hand - bet for value.';
    } else if (handAnalysis.strength === 'medium') {
      advice += 'Medium hand - can bet for thin value or check to control pot.';
    } else if (handAnalysis.strength === 'draw') {
      advice += 'Draw - can semi-bluff or check to see free card.';
    } else {
      advice += 'Weak hand - check or bluff if villain is tight.';
    }
  }

  return advice;
}

// Simple villain AI based on player type and hand strength
function getVillainAction(
  villain: PlayerState,
  hand: HandState,
  heroAction: ActionType
): { action: ActionType; amount: number } {
  const profile = PLAYER_PROFILES[villain.playerType];
  const toCall = hand.currentBet - villain.currentBet;

  let handStrength = 0.5;
  if (hand.board.length > 0) {
    const fullHand = [...villain.cards, ...hand.board];
    const evaluation = evaluateHand(fullHand);
    handStrength = (evaluation.rank / 9) * 0.8 + 0.1;
  } else {
    const notation = cardsToHandNotation(villain.cards);
    if (OPENING_RANGES['UTG'].includes(notation)) handStrength = 0.8;
    else if (OPENING_RANGES['CO'].includes(notation)) handStrength = 0.6;
    else if (OPENING_RANGES['BTN'].includes(notation)) handStrength = 0.4;
    else handStrength = 0.2;
  }

  const aggression = ((profile.aggression.min + profile.aggression.max) / 2) / 5;
  const vpip = ((profile.vpip.min + profile.vpip.max) / 2) / 100;
  const random = Math.random();

  if (toCall > 0) {
    const foldThreshold = (1 - vpip) * (1 - handStrength);
    if (random < foldThreshold && handStrength < 0.3) {
      return { action: 'fold', amount: 0 };
    }

    const raiseThreshold = aggression * handStrength;
    if (random < raiseThreshold && handStrength > 0.5) {
      const raiseAmount = Math.min(villain.stack, hand.currentBet * 2.5 + (hand.pot * 0.75));
      return { action: 'raise', amount: Math.round(raiseAmount * 10) / 10 };
    }

    if (toCall <= villain.stack) {
      return { action: 'call', amount: toCall };
    }
    return { action: 'fold', amount: 0 };
  }

  const betThreshold = aggression * (handStrength + 0.2);
  if (random < betThreshold && handStrength > 0.3) {
    const betAmount = Math.min(villain.stack, hand.pot * (0.5 + aggression * 0.5));
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

  const suitCounts = suits.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {} as Record<string, number>);
  const maxSuit = Math.max(...Object.values(suitCounts));
  const paired = new Set(board.map(c => c.rank)).size < board.length;
  const connected = ranks[0] - ranks[ranks.length - 1] <= 4;

  let texture = '';
  if (ranks[0] >= 10) texture += 'high ';
  else if (ranks[0] >= 7) texture += 'medium ';
  else texture += 'low ';

  if (maxSuit >= 3) texture += 'flush-possible ';
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
  const [customBet, setCustomBet] = useState('');
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [waitingForAction, setWaitingForAction] = useState(false);
  const messageIdRef = useRef(0);

  const addMessage = useCallback((
    type: CoachMessage['type'],
    content: string,
    options?: string[],
    waitingForResponse = false
  ) => {
    messageIdRef.current += 1;
    setMessages(prev => [...prev, {
      id: `msg-${messageIdRef.current}-${Date.now()}`,
      type,
      content,
      options,
      waitingForResponse,
    }]);
  }, []);

  const coachSays = useCallback((content: string, options?: string[], wait = false) => {
    setIsThinking(true);
    setTimeout(() => {
      setIsThinking(false);
      addMessage('coach', content, options, wait);
      if (wait) setWaitingForAction(true);
    }, 150 + Math.min(content.length * 5, 400));
  }, [addMessage]);

  // ============ START NEW HAND ============
  const startNewHand = useCallback(() => {
    const deck = shuffleDeck(createDeck());
    const positions: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
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
      pot: 1.5,
      currentBet: 1,
      players,
      activePlayerIdx: positions.indexOf('UTG'),
      lastAggressor: positions.indexOf('BB'),
      handNumber,
      actionHistory: [],
    };

    setGame({ hand: newHand, showRange: false });
    setMessages([]);
    setWaitingForAction(false);
    setCustomBet('');

    setTimeout(() => {
      const heroIdx = players.findIndex(p => p.isHero);
      const notation = cardsToHandNotation(players[heroIdx].cards);
      coachSays(`Hand #${handNumber}. You're in ${heroPosition} with ${notation}.`);
      setTimeout(() => simulatePreflopAction(newHand), 600);
    }, 300);
  }, [game.hand?.handNumber, coachSays]);

  // ============ PREFLOP ACTION ============
  const simulatePreflopAction = useCallback((hand: HandState) => {
    const heroIdx = hand.players.findIndex(p => p.isHero);
    let currentHand = { ...hand, players: [...hand.players] };
    let actionsToHero: string[] = [];

    for (let i = 0; i < heroIdx; i++) {
      const player = { ...currentHand.players[i] };
      if (player.isFolded) continue;

      const notation = cardsToHandNotation(player.cards);
      const shouldOpen = OPENING_RANGES[player.position].includes(notation);

      if (currentHand.currentBet === 1) {
        const playerPfr = (PLAYER_PROFILES[player.playerType].pfr.min + PLAYER_PROFILES[player.playerType].pfr.max) / 2;
        if (shouldOpen && Math.random() < playerPfr / 100 * 1.5) {
          const raiseSize = 2.5 + Math.random() * 0.5;
          player.currentBet = raiseSize;
          player.stack -= raiseSize;
          currentHand.currentBet = raiseSize;
          currentHand.pot += raiseSize;
          currentHand.lastAggressor = i;
          currentHand.lastAggressorPosition = player.position;
          actionsToHero.push(`${player.name} (${player.position}, ${PLAYER_PROFILES[player.playerType].name.split(' ')[0]}) raises to ${raiseSize.toFixed(1)}bb`);
        } else {
          player.isFolded = true;
          actionsToHero.push(`${player.name} folds`);
        }
      } else {
        const threeBetRange = THREE_BET_RANGES[player.position]?.[currentHand.players[currentHand.lastAggressor].position] || [];
        const callingRange = CALLING_RANGES[player.position]?.[currentHand.players[currentHand.lastAggressor].position] || [];

        if (threeBetRange.includes(notation) && Math.random() < 0.7) {
          const threeBetSize = currentHand.currentBet * 3;
          player.currentBet = threeBetSize;
          player.stack -= threeBetSize;
          currentHand.pot += threeBetSize;
          currentHand.currentBet = threeBetSize;
          currentHand.lastAggressor = i;
          currentHand.lastAggressorPosition = player.position;
          actionsToHero.push(`${player.name} 3-bets to ${threeBetSize.toFixed(1)}bb`);
        } else if (callingRange.includes(notation) && Math.random() < 0.8) {
          const callAmount = currentHand.currentBet - player.currentBet;
          player.currentBet = currentHand.currentBet;
          player.stack -= callAmount;
          currentHand.pot += callAmount;
          actionsToHero.push(`${player.name} calls`);
        } else {
          player.isFolded = true;
          actionsToHero.push(`${player.name} folds`);
        }
      }
      currentHand.players[i] = player;
    }

    setGame(prev => ({ ...prev, hand: currentHand }));

    if (actionsToHero.length > 0) {
      coachSays(actionsToHero.join('. ') + '.');
    }

    setTimeout(() => promptHeroAction(currentHand), actionsToHero.length > 0 ? 800 : 200);
  }, [coachSays]);

  // ============ PROMPT HERO ACTION ============
  const promptHeroAction = useCallback((hand: HandState) => {
    const heroIdx = hand.players.findIndex(p => p.isHero);
    const hero = hand.players[heroIdx];
    const toCall = hand.currentBet - hero.currentBet;
    const notation = cardsToHandNotation(hero.cards);
    const handAnalysis = analyzeHandStrength(hero.cards, hand.board);

    // Get coaching advice
    const advice = getCoachingAdvice(hand, hero, handAnalysis, toCall);

    let options: string[] = [];
    let situation = '';

    if (hand.street === 'preflop') {
      situation = toCall > 0
        ? `${toCall.toFixed(1)}bb to call into ${hand.pot.toFixed(1)}bb pot.`
        : `Pot: ${hand.pot.toFixed(1)}bb. Action on you.`;

      if (toCall === 0) {
        options = ['Check', 'Raise 2.5bb', 'Raise 3bb', 'Raise 4bb', 'Show Range'];
      } else {
        const raise3x = Math.round(hand.currentBet * 3 * 10) / 10;
        options = ['Fold', `Call ${toCall.toFixed(1)}bb`, `Raise ${raise3x}bb`, 'Show Range'];
      }
    } else {
      const boardStr = hand.board.map(c => c.rank + c.suit).join(' ');
      situation = `${hand.street.toUpperCase()}: ${boardStr}\nPot: ${hand.pot.toFixed(1)}bb${toCall > 0 ? `. ${toCall.toFixed(1)}bb to call.` : ''}`;

      if (toCall === 0) {
        const halfPot = Math.round(hand.pot * 0.5 * 10) / 10;
        const fullPot = Math.round(hand.pot * 10) / 10;
        options = ['Check', `Bet ${halfPot}bb (1/2)`, `Bet ${fullPot}bb (pot)`, 'Show Range'];
      } else {
        const raiseSize = Math.round(hand.currentBet * 2.5 * 10) / 10;
        options = ['Fold', `Call ${toCall.toFixed(1)}bb`, `Raise ${raiseSize}bb`, 'Show Range'];
      }
    }

    coachSays(`${situation}\n\n${advice}`, options, true);
  }, [coachSays]);

  // ============ HANDLE HERO ACTION ============
  const handleHeroAction = useCallback((action: string) => {
    if (!game.hand) return;

    // Handle show range
    if (action === 'Show Range') {
      setGame(prev => ({ ...prev, showRange: !prev.showRange }));
      return;
    }

    setWaitingForAction(false);
    addMessage('user', action);

    const hand = { ...game.hand, players: [...game.hand.players] };
    const heroIdx = hand.players.findIndex(p => p.isHero);
    const hero = { ...hand.players[heroIdx] };
    const toCall = hand.currentBet - hero.currentBet;

    if (action === 'Fold') {
      hero.isFolded = true;
      hand.players[heroIdx] = hero;
      hand.actionHistory.push('Hero folds');
      setGame(prev => ({ ...prev, hand }));
      coachSays("You fold.");
      setTimeout(() => endHand(hand, 'fold'), 500);
      return;
    }

    if (action === 'Check') {
      hand.actionHistory.push('Hero checks');
      hand.players[heroIdx] = hero;
      setGame(prev => ({ ...prev, hand }));
      coachSays("You check.");
      setTimeout(() => continueAction(hand, heroIdx), 500);
      return;
    }

    if (action.startsWith('Call')) {
      hero.currentBet = hand.currentBet;
      hero.stack -= toCall;
      hand.pot += toCall;
      hand.players[heroIdx] = hero;
      hand.actionHistory.push(`Hero calls ${toCall.toFixed(1)}bb`);
      setGame(prev => ({ ...prev, hand }));
      coachSays(`You call ${toCall.toFixed(1)}bb.`);
      setTimeout(() => continueAction(hand, heroIdx), 500);
      return;
    }

    if (action.startsWith('Bet') || action.startsWith('Raise')) {
      const match = action.match(/[\d.]+/);
      let amount = match ? parseFloat(match[0]) : hand.currentBet * 2.5;

      // Handle custom bet from input
      if (customBet && !isNaN(parseFloat(customBet))) {
        amount = parseFloat(customBet);
        setCustomBet('');
      }

      const additional = amount - hero.currentBet;
      hero.currentBet = amount;
      hero.stack -= additional;
      hand.pot += additional;
      hand.currentBet = amount;
      hand.lastAggressor = heroIdx;
      hand.players[heroIdx] = hero;
      hand.actionHistory.push(`Hero ${action.startsWith('Raise') ? 'raises' : 'bets'} ${amount.toFixed(1)}bb`);
      setGame(prev => ({ ...prev, hand }));
      coachSays(`You ${action.startsWith('Raise') ? 'raise to' : 'bet'} ${amount.toFixed(1)}bb.`);
      setTimeout(() => continueAction(hand, heroIdx), 500);
      return;
    }
  }, [game.hand, customBet, addMessage, coachSays]);

  // ============ CONTINUE ACTION ============
  const continueAction = useCallback((hand: HandState, afterPlayerIdx: number) => {
    let currentHand = { ...hand, players: [...hand.players] };
    const playersInHand = getPlayersInHand(currentHand.players);

    if (playersInHand.length === 1 && playersInHand[0].isHero) {
      endHand(currentHand, 'win');
      return;
    }

    let responses: string[] = [];
    const heroIdx = currentHand.players.findIndex(p => p.isHero);

    for (let i = afterPlayerIdx + 1; i < currentHand.players.length; i++) {
      const player = { ...currentHand.players[i] };
      if (player.isFolded || player.isHero) continue;

      const { action, amount } = getVillainAction(player, currentHand, 'bet');

      if (action === 'fold') {
        player.isFolded = true;
        responses.push(`${player.name} folds`);
      } else if (action === 'call') {
        const callAmount = currentHand.currentBet - player.currentBet;
        player.currentBet = currentHand.currentBet;
        player.stack -= callAmount;
        currentHand.pot += callAmount;
        responses.push(`${player.name} calls`);
      } else if (action === 'raise' || action === 'bet') {
        player.currentBet = amount;
        player.stack -= (amount - player.currentBet);
        currentHand.pot += amount - player.currentBet;
        currentHand.currentBet = amount;
        currentHand.lastAggressor = i;
        responses.push(`${player.name} ${action}s to ${amount.toFixed(1)}bb`);
      } else {
        responses.push(`${player.name} checks`);
      }
      currentHand.players[i] = player;
    }

    // Handle action reopening
    if (currentHand.currentBet > hand.currentBet) {
      for (let i = 0; i < heroIdx; i++) {
        const player = { ...currentHand.players[i] };
        if (player.isFolded || player.currentBet >= currentHand.currentBet) continue;

        const toCallAmount = currentHand.currentBet - player.currentBet;
        if (Math.random() < 0.4) {
          player.isFolded = true;
          responses.push(`${player.name} folds`);
        } else {
          player.currentBet = currentHand.currentBet;
          player.stack -= toCallAmount;
          currentHand.pot += toCallAmount;
          responses.push(`${player.name} calls`);
        }
        currentHand.players[i] = player;
      }
    }

    setGame(prev => ({ ...prev, hand: currentHand }));

    if (responses.length > 0) {
      coachSays(responses.join('. ') + '.');
    }

    const heroNeedsToAct = currentHand.currentBet > currentHand.players[heroIdx].currentBet && !currentHand.players[heroIdx].isFolded;

    if (heroNeedsToAct) {
      setTimeout(() => promptHeroAction(currentHand), 600);
      return;
    }

    const remaining = getPlayersInHand(currentHand.players);
    if (remaining.length === 1) {
      setTimeout(() => endHand(currentHand, remaining[0].isHero ? 'win' : 'lose'), 600);
      return;
    }

    setTimeout(() => dealNextStreet(currentHand), 800);
  }, [coachSays]);

  // ============ DEAL NEXT STREET ============
  const dealNextStreet = useCallback((hand: HandState) => {
    let currentHand = { ...hand, players: hand.players.map(p => ({ ...p, currentBet: 0 })) };
    currentHand.currentBet = 0;

    if (currentHand.street === 'preflop') {
      const { cards, remaining } = dealCards(currentHand.deck, 3);
      currentHand.board = cards;
      currentHand.deck = remaining;
      currentHand.street = 'flop';
    } else if (currentHand.street === 'flop') {
      const { cards, remaining } = dealCards(currentHand.deck, 1);
      currentHand.board = [...currentHand.board, ...cards];
      currentHand.deck = remaining;
      currentHand.street = 'turn';
    } else if (currentHand.street === 'turn') {
      const { cards, remaining } = dealCards(currentHand.deck, 1);
      currentHand.board = [...currentHand.board, ...cards];
      currentHand.deck = remaining;
      currentHand.street = 'river';
    } else if (currentHand.street === 'river') {
      currentHand.street = 'showdown';
      setGame(prev => ({ ...prev, hand: currentHand }));
      setTimeout(() => showdown(currentHand), 500);
      return;
    }

    setGame(prev => ({ ...prev, hand: currentHand }));

    const boardStr = currentHand.board.map(c => c.rank + c.suit).join(' ');
    const texture = analyzeBoardTexture(currentHand.board);
    coachSays(`${currentHand.street.toUpperCase()}: ${boardStr}\n${texture} board texture.`);

    const activeOrder = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
    const activePlayers = currentHand.players.filter(p => !p.isFolded);
    const firstToActPos = activeOrder.find(pos => activePlayers.some(p => p.position === pos));
    const firstToActIdx = currentHand.players.findIndex(p => p.position === firstToActPos);
    const heroIdx = currentHand.players.findIndex(p => p.isHero);

    if (firstToActIdx !== heroIdx && !currentHand.players[heroIdx].isFolded) {
      setTimeout(() => simulatePostflopToHero(currentHand, firstToActIdx, heroIdx), 600);
    } else {
      setTimeout(() => promptHeroAction(currentHand), 600);
    }
  }, [coachSays]);

  // ============ SIMULATE POSTFLOP TO HERO ============
  const simulatePostflopToHero = useCallback((hand: HandState, fromIdx: number, heroIdx: number) => {
    let currentHand = { ...hand, players: [...hand.players] };
    let actions: string[] = [];

    for (let i = fromIdx; i < heroIdx; i++) {
      const player = { ...currentHand.players[i] };
      if (player.isFolded) continue;

      const { action, amount } = getVillainAction(player, currentHand, 'check');

      if (action === 'bet') {
        player.currentBet = amount;
        player.stack -= amount;
        currentHand.pot += amount;
        currentHand.currentBet = amount;
        currentHand.lastAggressor = i;
        actions.push(`${player.name} bets ${amount.toFixed(1)}bb`);
      } else {
        actions.push(`${player.name} checks`);
      }
      currentHand.players[i] = player;
    }

    setGame(prev => ({ ...prev, hand: currentHand }));

    if (actions.length > 0) {
      coachSays(actions.join('. ') + '.');
    }

    setTimeout(() => promptHeroAction(currentHand), 600);
  }, [coachSays]);

  // ============ SHOWDOWN ============
  const showdown = useCallback((hand: HandState) => {
    const playersInHand = getPlayersInHand(hand.players);

    if (playersInHand.length < 2) {
      endHand(hand, playersInHand[0]?.isHero ? 'win' : 'lose');
      return;
    }

    const evaluations = playersInHand.map(p => ({
      player: p,
      hand: evaluateHand([...p.cards, ...hand.board]),
    }));

    evaluations.sort((a, b) => b.hand.score - a.hand.score);

    const winner = evaluations[0];

    let showdownMsg = 'SHOWDOWN!\n\n';
    evaluations.forEach(e => {
      showdownMsg += `${e.player.name}: ${e.player.cards[0].rank}${e.player.cards[0].suit} ${e.player.cards[1].rank}${e.player.cards[1].suit} - ${e.hand.rankName}\n`;
    });
    showdownMsg += `\n${winner.player.name} wins ${hand.pot.toFixed(1)}bb with ${winner.hand.rankName}!`;

    coachSays(showdownMsg);

    setTimeout(() => endHand(hand, winner.player.isHero ? 'win' : 'lose'), 1000);
  }, [coachSays]);

  // ============ END HAND ============
  const endHand = useCallback((hand: HandState, result: 'win' | 'lose' | 'fold') => {
    const hero = hand.players.find(p => p.isHero)!;
    const notation = cardsToHandNotation(hero.cards);

    let summary = result === 'win'
      ? `You win ${hand.pot.toFixed(1)}bb!`
      : result === 'lose'
        ? `You lose this hand.`
        : `You folded ${notation}.`;

    coachSays(summary);

    setTimeout(() => {
      let feedback = '';
      if (result === 'fold') {
        feedback = `Folding ${notation} - sometimes the right play. Think about whether you had the odds to continue, and what you were up against.`;
      } else if (result === 'win') {
        feedback = `Nice! Review: could you have extracted more value? Or was pot control the right approach?`;
      } else {
        feedback = `Tough spot. Was there a street where you could've gotten away cheaper, or was this just a cooler?`;
      }
      coachSays(feedback, ['Deal next hand', 'Show Range'], true);
    }, 800);
  }, [coachSays]);

  // ============ INITIALIZE ============
  useEffect(() => {
    coachSays("Welcome to Live Training. We'll play full hands and I'll coach you through each decision.");
    setTimeout(() => {
      coachSays("I'll explain what your hand, position, and the board mean for your decision. Ready?", ['Deal me in'], true);
    }, 800);
  }, []);

  // ============ RESPONSE HANDLER ============
  const handleResponse = useCallback((response: string, isCustom = false) => {
    if (response === 'Deal me in' || response === 'Deal next hand') {
      startNewHand();
      return;
    }

    if (response === 'Show Range') {
      setGame(prev => ({ ...prev, showRange: !prev.showRange }));
      if (!game.showRange) {
        coachSays("Range chart shown. Green = in range. Your hand is highlighted.");
      }
      return;
    }

    if (waitingForAction && !isCustom) {
      handleHeroAction(response);
      return;
    }

    // Custom questions
    if (isCustom && game.hand) {
      const hero = game.hand.players.find(p => p.isHero)!;
      const handAnalysis = analyzeHandStrength(hero.cards, game.hand.board);
      const toCall = game.hand.currentBet - hero.currentBet;
      const advice = getCoachingAdvice(game.hand, hero, handAnalysis, toCall);
      coachSays(advice);
    }
  }, [game, waitingForAction, startNewHand, handleHeroAction, coachSays]);

  // ============ RENDER ============
  const hand = game.hand;
  const hero = hand?.players.find(p => p.isHero);
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

  // Determine which range to show
  const getRangeToShow = () => {
    if (!hand || !hero) return [];
    if (hand.street === 'preflop') {
      if (hand.lastAggressorPosition && hand.lastAggressorPosition !== hero.position) {
        // Facing a raise - show calling + 3bet range
        return [
          ...(THREE_BET_RANGES[hero.position]?.[hand.lastAggressorPosition] || []),
          ...(CALLING_RANGES[hero.position]?.[hand.lastAggressorPosition] || []),
        ];
      }
      return OPENING_RANGES[hero.position];
    }
    // Postflop - show preflop opening range for reference
    return OPENING_RANGES[hero.position];
  };

  const getHighlightHands = () => {
    if (!hand || !hero) return [];
    if (hand.street === 'preflop' && hand.lastAggressorPosition) {
      return THREE_BET_RANGES[hero.position]?.[hand.lastAggressorPosition] || [];
    }
    return [];
  };

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
        <div className="lg:w-1/2 p-4 flex flex-col gap-4">
          <LiveTable
            seats={seats}
            board={hand?.board || []}
            pot={hand?.pot || 0}
            heroPosition={hero?.position || 'BTN'}
          />

          {/* Custom bet input */}
          {waitingForAction && hand && (
            <div className="flex gap-2 items-center bg-gray-900 p-3 rounded-lg">
              <span className="text-sm text-gray-400">Custom bet:</span>
              <input
                type="number"
                value={customBet}
                onChange={(e) => setCustomBet(e.target.value)}
                placeholder="Enter amount"
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1 w-24 text-white"
              />
              <span className="text-sm text-gray-400">bb</span>
              <button
                onClick={() => {
                  if (customBet) {
                    handleHeroAction(`Bet ${customBet}bb`);
                  }
                }}
                disabled={!customBet}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded text-sm"
              >
                Bet/Raise
              </button>
            </div>
          )}

          {/* Range display */}
          {game.showRange && hero && (
            <div className="bg-gray-900 p-4 rounded-xl">
              <h3 className="text-sm font-semibold mb-2 text-gray-400">
                {hand?.street === 'preflop' && hand.lastAggressorPosition
                  ? `${hero.position} vs ${hand.lastAggressorPosition} open (green=3bet, yellow=call)`
                  : `${hero.position} Opening Range`}
              </h3>
              <RangeGrid
                selectedHands={getRangeToShow()}
                highlightHands={getHighlightHands()}
                heroHand={cardsToHandNotation(hero.cards)}
                readOnly
              />
            </div>
          )}
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
