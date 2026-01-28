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

// Get coaching advice based on situation - conversational style
function getCoachingAdvice(
  hand: HandState,
  hero: PlayerState,
  handAnalysis: ReturnType<typeof analyzeHandStrength>,
  toCall: number
): string {
  const notation = cardsToHandNotation(hero.cards);
  const villains = hand.players.filter(p => !p.isFolded && !p.isHero);
  const inPosition = villains.length === 0 || POSITIONS.indexOf(hero.position) > Math.max(...villains.map(v => POSITIONS.indexOf(v.position)));
  const mainVillain = villains[0];

  // Build conversational advice with questions
  const parts: string[] = [];

  // Start with a thinking prompt based on situation
  if (toCall > 0) {
    const potOdds = (toCall / (hand.pot + toCall) * 100);
    parts.push(`${toCall.toFixed(1)}bb to call into ${hand.pot.toFixed(1)}bb. That's ${potOdds.toFixed(0)}% pot odds.`);

    // Add villain context as a question
    if (mainVillain) {
      if (mainVillain.playerType === 'LAG' || mainVillain.playerType === 'MANIAC') {
        parts.push(`${mainVillain.name} is aggressive - could easily be bluffing here. How often does ${notation} win against a wide range?`);
      } else if (mainVillain.playerType === 'NIT' || mainVillain.playerType === 'TAG') {
        parts.push(`${mainVillain.name} is tight though. When they bet, they usually mean it. What hands beat you that they'd play this way?`);
      } else if (mainVillain.playerType === 'FISH' || mainVillain.playerType === 'CALLING_STATION') {
        parts.push(`${mainVillain.name} plays too many hands. You might actually be ahead here more than you think.`);
      }
    }

    // Strength-based thinking
    if (handAnalysis.strength === 'strong') {
      parts.push(`You're strong here. Question is: call and trap, or raise and build a pot?`);
    } else if (handAnalysis.strength === 'draw') {
      parts.push(`Drawing hand. Do the math - you need ${(toCall / (hand.pot + toCall) * 100).toFixed(0)}% equity. Does your draw have it?`);
    } else if (handAnalysis.strength === 'medium') {
      parts.push(`Medium strength. Tough spot. Think about what worse hands they bet that you beat.`);
    } else {
      parts.push(`Weak holding. Unless you're sure they're bluffing, this is probably a fold.`);
    }
  } else {
    // Checked to us
    if (hand.board.length > 0) {
      parts.push(`Checked to you.`);

      if (handAnalysis.strength === 'strong') {
        parts.push(`Strong hand - this is a bet. What sizing gets called by worse?`);
      } else if (handAnalysis.strength === 'medium') {
        parts.push(`Medium hand. You could bet thin for value, or check for pot control. What's villain likely to do if you bet?`);
      } else if (handAnalysis.strength === 'draw') {
        parts.push(`Draw. Could semi-bluff here and put them in a tough spot. Or check and see a free card.`);
      } else {
        parts.push(`Weak hand. Bet as a bluff if villain folds a lot. Otherwise take the free card.`);
      }
    } else {
      // Preflop
      parts.push(`Action's on you.`);
    }
  }

  // Add position context naturally
  if (hand.street !== 'preflop') {
    if (inPosition) {
      parts.push(`You have position - use it.`);
    } else {
      parts.push(`Out of position here, so be careful.`);
    }
  }

  return parts.join('\n\n');
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

  // Track last topic for follow-up questions
  const lastTopicRef = useRef<string>('general');

  // ============ ANSWER QUESTION ============
  const answerQuestion = useCallback((question: string, hand: HandState): string => {
    const q = question.toLowerCase().trim();
    const hero = hand.players.find(p => p.isHero)!;
    const notation = cardsToHandNotation(hero.cards);
    const villains = hand.players.filter(p => !p.isFolded && !p.isHero);
    const board = hand.board;
    const toCall = hand.currentBet - hero.currentBet;
    const mainVillain = villains[0];
    const handAnalysis = analyzeHandStrength(hero.cards, board);

    // Helper: check if question contains any of these words
    const hasAny = (...words: string[]) => words.some(w => q.includes(w));

    // Helper: give a full situation summary
    const getFullSummary = () => {
      let response = `**Your hand (${notation}):** ${handAnalysis.made}`;
      if (handAnalysis.draws.length > 0) response += ` + ${handAnalysis.draws.join(', ')}`;
      response += `\n\n`;

      if (board.length > 0) {
        response += `**Board:** ${board.map(c => c.rank + c.suit).join(' ')} (${analyzeBoardTexture(board)})\n\n`;
      }

      if (mainVillain) {
        const profile = PLAYER_PROFILES[mainVillain.playerType];
        response += `**${mainVillain.name}:** ${profile.name}`;
        if (mainVillain.playerType === 'LAG' || mainVillain.playerType === 'MANIAC') {
          response += ` - aggressive, wide range, could be bluffing`;
        } else if (mainVillain.playerType === 'NIT' || mainVillain.playerType === 'TAG') {
          response += ` - tight, usually has it when betting`;
        } else if (mainVillain.playerType === 'FISH' || mainVillain.playerType === 'CALLING_STATION') {
          response += ` - calls too much, don't bluff them`;
        }
        response += `\n\n`;
      }

      if (toCall > 0) {
        const potOdds = (toCall / (hand.pot + toCall) * 100);
        response += `**Math:** ${toCall.toFixed(1)}bb to call into ${hand.pot.toFixed(1)}bb = ${potOdds.toFixed(0)}% pot odds\n\n`;
      }

      response += `**Bottom line:** `;
      if (handAnalysis.strength === 'strong') {
        response += toCall > 0 ? `You're strong. Raise for value or call to trap.` : `Bet for value. 60-75% pot.`;
      } else if (handAnalysis.strength === 'medium') {
        response += toCall > 0 ? `Medium hand. Call if villain is loose, fold if tight.` : `Bet small or check for pot control.`;
      } else if (handAnalysis.strength === 'draw') {
        const potOdds = toCall > 0 ? (toCall / (hand.pot + toCall) * 100) : 0;
        response += toCall > 0 ? `Draw. ${potOdds < 35 ? 'Odds are good - call.' : 'Odds are marginal.'}` : `Semi-bluff or check for free card.`;
      } else {
        response += toCall > 0 ? `Weak. Fold unless you're sure they're bluffing.` : `Check. Only bluff vs tight players.`;
      }

      return response;
    };

    // === FOLLOW-UP QUESTIONS (short/vague) ===
    // Handle "why", "more", "explain", "?", single words, etc.
    if (q.length < 10 || hasAny('why?', 'more', 'explain', 'huh', 'what?', '?')) {
      // Respond based on last topic
      if (lastTopicRef.current === 'odds') {
        return `Pot odds tell you the minimum equity you need to call profitably.\n\nIf pot odds are 25%, you need to win more than 25% of the time to profit long-term. Simple as that.\n\nYour ${notation} - do you think it wins ${(toCall / (hand.pot + toCall) * 100).toFixed(0)}%+ against their range?`;
      }
      if (lastTopicRef.current === 'villain') {
        return getFullSummary();
      }
      if (lastTopicRef.current === 'range') {
        if (mainVillain) {
          return `Think about what ${mainVillain.name} would play preflop, then which of those hands would bet/raise like this.\n\nThat's their range right now. Does your ${notation} beat most of it?`;
        }
      }
      // Default: give full summary
      lastTopicRef.current = 'general';
      return getFullSummary();
    }

    // === HOW QUESTIONS ===
    if (hasAny('how do', 'how should', 'how to', 'how can', 'how did', 'how does', 'how is', 'what\'s the math', 'calculate')) {
      lastTopicRef.current = 'odds';

      if (hasAny('pot odds', 'odds', 'math', 'percent', '%', 'equity', 'ev', 'expected')) {
        const potAfterCall = hand.pot + toCall;
        const potOdds = (toCall / potAfterCall * 100);
        return `**Pot odds calculation:**\n\nYou risk ${toCall.toFixed(1)}bb to win ${hand.pot.toFixed(1)}bb.\n\n${toCall.toFixed(1)} ÷ ${potAfterCall.toFixed(1)} = **${potOdds.toFixed(0)}%**\n\nYou need ${potOdds.toFixed(0)}%+ equity to call profitably.\n\n**Common equities:**\n• Overpair vs underpair: ~80%\n• Flush draw: ~35%\n• Open-ender: ~32%\n• Gutshot: ~17%\n\nDoes ${notation} have ${potOdds.toFixed(0)}%+ against their range?`;
      }

      if (hasAny('out', 'draw', 'flush', 'straight', 'hit')) {
        return `**Counting outs:**\n\n• Flush draw = 9 outs (13 - 4 you see)\n• Open-ender = 8 outs (two ends × 4 cards each)\n• Gutshot = 4 outs (one rank × 4 cards)\n• Two overcards = 6 outs (3 of each rank)\n\n**Quick math:**\n• Flop (2 cards to come): outs × 4 = ~%\n• Turn (1 card to come): outs × 2 = ~%\n\nWhat draws does your ${notation} have on this board?`;
      }

      if (hasAny('bet', 'check', 'sizing', 'size')) {
        lastTopicRef.current = 'betting';
        return `**Bet or check framework:**\n\n**Bet when:**\n1. Value: worse hands call\n2. Bluff: better hands fold\n3. Protection: deny equity to draws\n\n**Check when:**\n1. You'd hate getting raised\n2. Villain will bluff if you check\n3. No worse hands call anyway\n\nYour ${notation} is ${handAnalysis.strength}. ${handAnalysis.strength === 'strong' ? 'Usually betting.' : handAnalysis.strength === 'medium' ? 'Depends on villain - bet vs stations, check vs aggro.' : 'Check or bluff vs tight players.'}`;
      }

      if (hasAny('think', 'approach', 'decide', 'play')) {
        return getFullSummary();
      }

      // Generic how
      return `Good instinct to ask how.\n\nIn poker, decisions come from:\n1. **Your hand strength** - ${notation} is ${handAnalysis.made}\n2. **Villain's range** - what hands would they play this way?\n3. **Math** - do the pot odds justify calling?\n\nWhich part are you stuck on?`;
    }

    // === BET VS CHECK QUESTIONS ===
    if (hasAny('bet or check', 'check or bet', 'betting vs', 'should i bet', 'should i check', 'bet here', 'check here')) {
      lastTopicRef.current = 'betting';

      let response = `**Bet vs Check Framework:**\n\n`;
      response += `**BET when:**\n• Worse hands call (value)\n• Better hands fold (bluff)\n• You deny equity to draws\n\n`;
      response += `**CHECK when:**\n• You can't handle a raise\n• Villain will bluff if you check\n• Nothing worse calls anyway\n\n`;

      response += `**Your ${notation}:** ${handAnalysis.strength}. `;
      if (handAnalysis.strength === 'strong') {
        response += `Bet for value. What sizing gets called by worse?`;
      } else if (handAnalysis.strength === 'medium') {
        response += `Tricky. If villain is a calling station, bet thin. If aggressive, check-call.`;
      } else if (handAnalysis.strength === 'draw') {
        response += `Can semi-bluff (bet with outs) or check for free card.`;
      } else {
        response += `Check. Only bluff if villain folds a lot.`;
      }

      if (mainVillain) {
        response += `\n\n**vs ${mainVillain.name}:** `;
        if (mainVillain.playerType === 'FISH' || mainVillain.playerType === 'CALLING_STATION') {
          response += `Calls too much → bet for value, never bluff.`;
        } else if (mainVillain.playerType === 'LAG' || mainVillain.playerType === 'MANIAC') {
          response += `Aggressive → check to induce bluffs, or bet to "re-bluff".`;
        } else if (mainVillain.playerType === 'NIT' || mainVillain.playerType === 'TAG') {
          response += `Tight → can bluff more, but fold to their aggression.`;
        }
      }

      return response;
    }

    // === WHY QUESTIONS ===
    if (hasAny('why fold', 'why call', 'why raise', 'why bet', 'why check', 'why not', 'why should', 'why would')) {
      lastTopicRef.current = 'why';

      if (hasAny('fold')) {
        return `**Why fold?**\n\nAsk yourself: What hands am I beating that would bet/raise like this?\n\nIf you can't name many... fold is right.\n\nWith ${notation}, you beat: bluffs, worse pairs. You lose to: better pairs, sets, straights, flushes.\n\nAgainst ${mainVillain?.name || 'villain'}'s range, are you ahead often enough?`;
      }
      if (hasAny('raise', 'bet')) {
        return `**Why raise/bet?**\n\nTwo reasons:\n1. **Value** - worse hands call\n2. **Bluff** - better hands fold\n\nWith ${notation}: ${handAnalysis.strength === 'strong' ? 'You have value. What worse hands call?' : handAnalysis.strength === 'draw' ? 'Semi-bluff makes sense - value if called, fold equity now.' : 'Limited value. Bluffing only works vs tight players.'}\n\nWhat's your goal here?`;
      }
      if (hasAny('call')) {
        return `**Why call?**\n\nCalling makes sense when:\n• Drawing with correct odds\n• Trapping a bluffer\n• Raising folds out hands you beat\n\nWith ${notation}, ${handAnalysis.draws.length > 0 ? 'you have draws - check if odds are right.' : 'no draws - you\'re calling for showdown value.'}\n\nIf ahead, why not raise? If behind, why not fold?`;
      }
      if (hasAny('check')) {
        return `**Why check?**\n\nChecking works when:\n• You can't handle a raise\n• Villain will bet bluffs\n• Nothing worse calls your bet\n\nWith ${notation}, ${handAnalysis.strength === 'medium' ? 'medium hand - checking for pot control is fine.' : handAnalysis.strength === 'strong' ? 'strong hand - checking is usually leaving money on the table.' : 'weak hand - checking makes sense unless you want to bluff.'}`;
      }

      return `Every action needs a reason.\n\n• Fold: not enough equity\n• Call: have odds or trapping\n• Raise: value or bluff\n• Check: pot control or induce\n\nWhich action are you wondering about?`;
    }

    // === VILLAIN/PLAYER QUESTIONS ===
    // Detect player names dynamically
    const allPlayers = hand.players.filter(p => !p.isHero);
    const mentionedPlayer = allPlayers.find(p => {
      const nameLower = p.name.toLowerCase();
      const firstName = nameLower.split(/[_\s]/)[0];
      return q.includes(nameLower) || q.includes(firstName) || (firstName.length > 3 && q.includes(firstName.slice(0, 4)));
    });

    const villainKeywords = ['villain', 'opponent', 'player', 'they', 'their', 'them', 'who is', 'who are', 'what type', 'read on', 'tell me about', 'what about', 'is he', 'is she', 'are they', 'what kind', 'type of'];
    const isVillainQuestion = hasAny(...villainKeywords) || mentionedPlayer;

    if (isVillainQuestion) {
      lastTopicRef.current = 'villain';
      const v = mentionedPlayer || mainVillain;

      if (!v) {
        return "No opponents left in the hand.";
      }

      const profile = PLAYER_PROFILES[v.playerType];
      let response = `**${v.name}** - ${profile.name}\n\n`;

      if (v.playerType === 'LAG' || v.playerType === 'MANIAC') {
        response += `**Style:** Aggressive, wide range, bluffs often.\n\n`;
        response += `**Exploit:** Call down lighter. Don't fold pairs to one bet. Let them bluff off chips.\n\n`;
        response += `**Caution:** Respect triple-barrels - even maniacs have hands.`;
      } else if (v.playerType === 'NIT' || v.playerType === 'TAG') {
        response += `**Style:** Tight, strong hands only, rarely bluffs.\n\n`;
        response += `**Exploit:** Fold to big bets. Steal blinds. Don't try to bluff them.\n\n`;
        response += `**Caution:** When they bet big, they have it.`;
      } else if (v.playerType === 'FISH' || v.playerType === 'CALLING_STATION') {
        response += `**Style:** Loose-passive, calls everything, hates folding.\n\n`;
        response += `**Exploit:** NEVER bluff. Value bet thin. Middle pair is often good.\n\n`;
        response += `**Caution:** When they bet (rare), they usually have it.`;
      } else {
        response += `**Style:** Standard, balanced.\n\n`;
        response += `**Exploit:** Play solid. Look for patterns.\n\n`;
        response += `**Caution:** No obvious leaks.`;
      }

      if (board.length > 0) {
        response += `\n\n**On this board:** What hands would ${v.name} play this way?`;
      }

      return response;
    }

    // === POSITION QUESTIONS ===
    if (hasAny('position', ' ip', ' oop', 'in position', 'out of position', 'act first', 'act last')) {
      lastTopicRef.current = 'position';
      const inPosition = villains.length === 0 || POSITIONS.indexOf(hero.position) > Math.max(...villains.map(v => POSITIONS.indexOf(v.position)));

      if (inPosition) {
        return `**You're IN POSITION** (act last)\n\n**Why it's good:**\n• See their action before deciding\n• Control pot size\n• Bluff more effectively\n• Take free cards when you want\n\n**How to use it:** Play more hands, bluff more, value bet thinner. You have the information advantage.`;
      }
      return `**You're OUT OF POSITION** (act first)\n\n**Why it sucks:**\n• Must act without info\n• Hard to bluff\n• Can't control pot size\n\n**How to adjust:** Play tighter, bet bigger for protection, check-raise more. Don't try to bluff catch.`;
    }

    // === WHAT SHOULD I DO ===
    if (hasAny('should i', 'what do i', 'what should', 'what\'s the play', 'help', 'advice', 'recommend', 'best play', 'correct play', 'what now', 'do here')) {
      lastTopicRef.current = 'action';
      return getFullSummary();
    }

    // === BOARD TEXTURE ===
    if (hasAny('board', 'texture', 'flop', 'turn', 'river', 'community', 'what hit')) {
      lastTopicRef.current = 'board';

      if (board.length === 0) {
        return "No board yet - we're preflop. Board texture matters after the flop.";
      }

      const texture = analyzeBoardTexture(board);
      const boardStr = board.map(c => c.rank + c.suit).join(' ');
      let response = `**Board: ${boardStr}**\n**Texture: ${texture}**\n\n`;

      if (texture.includes('flush')) {
        response += `**Flush possible.** Anyone with two of that suit is there.\n\n`;
        response += `If you have it: Value bet, but watch paired boards.\n`;
        response += `If you don't: Be careful vs aggression.`;
      } else if (texture.includes('paired')) {
        response += `**Paired board.** Full houses and quads possible.\n\n`;
        response += `One pair is weaker here. Check more with medium hands.`;
      } else if (texture.includes('connected')) {
        response += `**Connected.** Straights likely.\n\n`;
        response += `Sets are vulnerable. Bet big to charge draws.`;
      } else {
        response += `**Dry board.** Few draws possible.\n\n`;
        response += `Top pair is strong here. Can value bet thinner.`;
      }

      response += `\n\n**Your ${notation}:** ${handAnalysis.made}${handAnalysis.draws.length > 0 ? ` + ${handAnalysis.draws.join(', ')}` : ''}`;

      return response;
    }

    // === ODDS/EQUITY ===
    if (hasAny('odds', 'equity', 'percent', '%', 'ev', 'expected value', 'profitable', 'math')) {
      lastTopicRef.current = 'odds';

      if (toCall === 0) {
        return `No bet to call. You're in a good spot - can bet for value or check for free card.\n\nWith ${notation} (${handAnalysis.strength}): ${handAnalysis.strength === 'strong' ? 'Bet for value.' : handAnalysis.strength === 'medium' ? 'Can bet small or check.' : 'Check or bluff.'}`;
      }

      const potOdds = (toCall / (hand.pot + toCall) * 100);
      return `**Pot Odds:**\n\n${toCall.toFixed(1)}bb to call / ${(hand.pot + toCall).toFixed(1)}bb total = **${potOdds.toFixed(0)}%**\n\nYou need ${potOdds.toFixed(0)}%+ equity.\n\n**Common hands vs ranges:**\n• vs tight (AA-TT, AK): ~30%\n• vs loose (any pair/draw): ~45%\n\n**Your ${notation}:** ${handAnalysis.strength === 'strong' ? 'Ahead of most ranges.' : handAnalysis.strength === 'draw' ? `Draw equity ~${handAnalysis.draws.includes('flush draw') ? '35%' : '17-32%'}` : 'Marginal.'}`;
    }

    // === RANGE QUESTIONS ===
    if (hasAny('range', 'what hands', 'hands would', 'would they play', 'they have', 'holding', 'cards do', 'which hands', 'could have', 'might have', 'does he have', 'does she have')) {
      lastTopicRef.current = 'range';

      if (!mainVillain) {
        return "No opponents left. You won!";
      }

      const profile = PLAYER_PROFILES[mainVillain.playerType];
      let response = `**${mainVillain.name}'s Range** (${profile.name})\n\n`;

      if (mainVillain.playerType === 'NIT' || mainVillain.playerType === 'TAG') {
        response += `**Preflop range:** ~12-15% (AA-TT, AK, AQ, AJs+, KQs)\n\n`;
        response += `**What they bet:** Strong value - top pair+, sets, straights. Rarely bluffs.\n\n`;
        response += `**Your question:** Does ${notation} beat their value range?`;
      } else if (mainVillain.playerType === 'LAG' || mainVillain.playerType === 'MANIAC') {
        response += `**Preflop range:** ~35-50% (any pair, suited, connector, face)\n\n`;
        response += `**What they bet:** Everything - value, draws, air. Hard to narrow.\n\n`;
        response += `**Your question:** Do you beat enough bluffs to call?`;
      } else if (mainVillain.playerType === 'FISH' || mainVillain.playerType === 'CALLING_STATION') {
        response += `**Preflop range:** ~40%+ (any ace, suited, face, pair)\n\n`;
        response += `**What they bet:** Usually strong (they prefer calling). Weak pairs just check.\n\n`;
        response += `**Your question:** When fish bet, it's usually real. Are you ahead?`;
      } else {
        response += `**Preflop range:** Standard position-based\n\n`;
        response += `**What they bet:** Mix of value and draws.\n\n`;
        response += `**Your question:** What hands bet this board this way?`;
      }

      if (board.length > 0) {
        response += `\n\n**Board (${board.map(c => c.rank + c.suit).join(' ')}):** Which hands in their range connect here?`;
      }

      return response;
    }

    // === MY HAND QUESTIONS ===
    if (hasAny('my hand', 'my cards', 'what do i have', 'am i strong', 'am i weak', 'how good', 'how bad', 'do i have')) {
      lastTopicRef.current = 'hand';

      let response = `**Your Hand: ${notation}**\n\n`;
      response += `**Made hand:** ${handAnalysis.made}\n`;
      if (handAnalysis.draws.length > 0) {
        response += `**Draws:** ${handAnalysis.draws.join(', ')}\n`;
      }
      response += `**Strength:** ${handAnalysis.strength.toUpperCase()}\n\n`;

      if (handAnalysis.strength === 'strong') {
        response += `This is a value hand. Build the pot, get paid.`;
      } else if (handAnalysis.strength === 'medium') {
        response += `Medium - tricky. Pot control or thin value depending on villain.`;
      } else if (handAnalysis.strength === 'draw') {
        response += `Drawing hand. Check odds, consider semi-bluff.`;
      } else {
        response += `Weak. Check/fold or bluff if villain is tight.`;
      }

      return response;
    }

    // === CATCH-ALL: Give full summary for anything unclear ===
    // This should catch most remaining questions
    lastTopicRef.current = 'general';
    return getFullSummary();
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

    // Custom questions - use answerQuestion
    if (isCustom && game.hand) {
      addMessage('user', response);
      const answer = answerQuestion(response, game.hand);
      coachSays(answer);
    }
  }, [game, waitingForAction, startNewHand, handleHeroAction, coachSays, answerQuestion, addMessage]);

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
            <div className="bg-gray-900 p-4 rounded-xl relative">
              <button
                onClick={() => setGame(prev => ({ ...prev, showRange: false }))}
                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded-full text-gray-300 hover:text-white transition"
              >
                ✕
              </button>
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
