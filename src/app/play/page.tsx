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

  // ============ ANSWER QUESTION ============
  const answerQuestion = useCallback((question: string, hand: HandState): string => {
    const q = question.toLowerCase();
    const hero = hand.players.find(p => p.isHero)!;
    const notation = cardsToHandNotation(hero.cards);
    const villains = hand.players.filter(p => !p.isFolded && !p.isHero);
    const board = hand.board;
    const toCall = hand.currentBet - hero.currentBet;

    // HOW questions - explain the methodology step by step
    if (q.includes('how') && (q.includes('calculate') || q.includes('get') || q.includes('know') || q.includes('figure'))) {

      // Pot odds calculation
      if (q.includes('pot odds') || q.includes('odds')) {
        const potAfterCall = hand.pot + toCall;
        return `Okay, let me walk you through it.\n\nPot odds = what you risk ÷ what you can win.\n\nRight now:\n• Pot is ${hand.pot.toFixed(1)}bb\n• You need to call ${toCall.toFixed(1)}bb\n• If you call, total pot becomes ${potAfterCall.toFixed(1)}bb\n\nSo: ${toCall.toFixed(1)} ÷ ${potAfterCall.toFixed(1)} = ${(toCall / potAfterCall * 100).toFixed(0)}%\n\nThat means you need ${(toCall / potAfterCall * 100).toFixed(0)}% equity to break even. If your hand wins more often than that vs their range, calling prints money long term.\n\nDoes that make sense? What do you think your equity is here?`;
      }

      // Outs calculation
      if (q.includes('out') || q.includes('draw') || q.includes('flush') || q.includes('straight') || q.includes('each of these')) {
        return `Good question. Here's how outs work.\n\nFlush draw (9 outs): 13 cards of each suit in the deck. If you have 4 to a flush, there's 9 left that complete it. On the flop with 2 cards to come: 9 × 4 = ~36%.\n\nOpen-ended straight draw (8 outs): Like holding 7-8 on a 5-6-x board. You hit with any 4 or any 9 - that's 8 cards.\n\nGutshot (4 outs): Inside straight draw. Like 5-7 needing a 6. Only 4 sixes in the deck.\n\nThe "× 4 rule" is a shortcut for flop equity (two cards to come). On the turn, use × 2.\n\nWith your ${notation}, what draws do you have right now?`;
      }

      // General "how do you know"
      return `That's the right question to ask.\n\nIn poker, everything comes back to: what range does villain have, and how does my hand do against it?\n\nA tight player betting big = strong range = you need a strong hand.\nA loose player betting = wide range = you can call lighter.\n\nWhat specifically are you trying to figure out?`;
    }

    // WHY questions - make them think
    if (q.includes('why')) {
      if (q.includes('fold')) {
        return `Let me flip it on you - what hands are you beating here?\n\nWhen you can't answer that, folding starts to make sense. ${notation} has showdown value, but against a bet, ask:\n\n1. What worse hands bet like this?\n2. What better hands bet like this?\n\nIf the answer to #2 is way longer than #1... fold is probably right. What do you think they're repping here?`;
      }
      if (q.includes('raise') || q.includes('bet')) {
        return `Before you raise, answer this: what's your goal?\n\nValue raise: "I want worse hands to call." What worse hands call?\n\nBluff raise: "I want better hands to fold." What better hands fold?\n\nIf you can't name specific hands for either... maybe just calling or folding is better.\n\nWith ${notation} here, what are you trying to accomplish?`;
      }
      if (q.includes('call')) {
        return `Calling is the "I'm not sure" button. Nothing wrong with that sometimes.\n\nBut think about it - if you're ahead, wouldn't raising be better? If you're behind, why not fold?\n\nCalling makes sense when:\n• You have a draw with odds\n• You're trapping a bluffer\n• Raising folds out worse hands\n\nWhich applies to you right now?`;
      }
      return `Good instinct to ask why.\n\nEvery action should have a reason. "I felt like it" isn't a reason. What specifically confused you?`;
    }

    // Villain analysis
    if (q.includes('villain') || q.includes('opponent') || q.includes('player') || q.includes('their') || q.includes('sharky') || q.includes('who')) {
      if (villains.length === 0) {
        return "Everyone folded. You won this one before showdown.";
      }

      const v = villains[0];
      const profile = PLAYER_PROFILES[v.playerType];
      const vpip = ((profile.vpip.min + profile.vpip.max) / 2);
      const agg = ((profile.aggression.min + profile.aggression.max) / 2);

      let response = `${v.name} is a ${profile.name.toLowerCase()}.\n\n`;

      if (v.playerType === 'LAG' || v.playerType === 'MANIAC') {
        response += `These players put constant pressure. They'll bet with air, semi-bluffs, and value all mixed together.\n\nYour adjustment: Call down lighter. Don't fold middle pair to one bet. Let them hang themselves with bluffs.\n\nBUT - when they bet-bet-bet on three streets, respect it more. Even maniacs have hands sometimes.`;
      } else if (v.playerType === 'NIT' || v.playerType === 'TAG') {
        response += `These players only put money in with goods. If ${v.name} is betting, they've probably got it.\n\nYour adjustment: Fold more often to big bets. Don't try to bluff them off hands - they only play strong ones.\n\nSteal their blinds relentlessly though. They fold way too much preflop.`;
      } else if (v.playerType === 'FISH' || v.playerType === 'CALLING_STATION') {
        response += `These players call too much. Way too much. They want to see showdowns.\n\nYour adjustment: Never bluff. Value bet thinner - even middle pair for value sometimes. They'll call with worse.\n\nDon't get frustrated when they suck out. Just keep value betting.`;
      } else {
        response += `Standard player - plays reasonable ranges.\n\nYour adjustment: Respect their bets somewhat, but look for spots where they're weak. Don't do anything too fancy.`;
      }

      return response;
    }

    // Position
    if (q.includes('position') || q.includes('ip') || q.includes('oop')) {
      const inPosition = villains.length === 0 || POSITIONS.indexOf(hero.position) > Math.max(...villains.map(v => POSITIONS.indexOf(v.position)));
      if (inPosition) {
        return `You're in position. This is a huge advantage.\n\nThink about it - they have to act first. If they check, you can bet or take a free card. If they bet, you see the bet before committing.\n\nIn position, you can play weaker hands profitably. You control the pot size. You can bluff more effectively because you have the last word on each street.\n\nUse it.`;
      }
      return `You're out of position. Tougher spot.\n\nYou have to act first on every street. Check and they might bet. Bet and they might raise. You're always guessing.\n\nOut of position: play tighter, bet bigger for protection, and be willing to check-raise strong hands more often. Don't try to bluff catch as much - you're at an information disadvantage.`;
    }

    // What should I do / what's the play
    if (q.includes('should') || q.includes('what do') || q.includes('what\'s the play') || q.includes('help')) {
      const handAnalysis = analyzeHandStrength(hero.cards, board);

      if (toCall > 0) {
        const potOdds = (toCall / (hand.pot + toCall) * 100);

        if (handAnalysis.strength === 'strong') {
          return `You've got a strong hand. Don't just call - raise it up. Make them pay, or find out if they have you beat.\n\nWhat's the worst that happens? They fold and you win the pot. Or they call/raise and you know where you stand.`;
        } else if (handAnalysis.strength === 'draw') {
          if (potOdds < 35) {
            return `Drawing hand with ${potOdds.toFixed(0)}% pot odds. If you're on a flush draw, you've got the odds. If it's just a gutshot, it's closer.\n\nYou could also raise as a semi-bluff - put pressure on them while having outs if called.`;
          }
          return `Drawing hand but the price is steep - ${potOdds.toFixed(0)}% to call. Think about implied odds - if you hit, can you get paid? Against a fish, yes. Against a nit, probably not.`;
        } else {
          return `Honest answer? ${notation} is pretty weak here. Pot odds are ${potOdds.toFixed(0)}%.\n\nYou could call and hope to improve, but that's not a strategy, that's gambling. Unless you have a specific read that they're bluffing, folding is fine.\n\nWhat's making you want to continue?`;
        }
      } else {
        if (handAnalysis.strength === 'strong') {
          return `Strong hand, checked to you. Bet for value. Something like 50-75% pot to start.\n\nYou want worse hands to call. Don't slowplay - that's how you let free cards come that beat you.`;
        } else if (handAnalysis.strength === 'medium') {
          return `Medium strength hand. This is a spot for pot control.\n\nYou can bet small for thin value, or check to get to showdown cheaply. Depends on the villain - against a calling station, bet. Against someone who raises a lot, checking is fine.`;
        } else {
          return `Weak hand. You can check and give up, or take a stab if you think they'll fold.\n\nBluffing here works against tight players. Against calling stations, just check and pray.`;
        }
      }
    }

    // Board texture
    if (q.includes('board') || q.includes('texture') || q.includes('flop')) {
      if (board.length === 0) {
        return "No board yet. Preflop is all about hand strength, position, and reads. What's your question?";
      }
      const texture = analyzeBoardTexture(board);
      const boardStr = board.map(c => c.rank + c.suit).join(' ');

      let response = `Board: ${boardStr}\n\n`;

      if (texture.includes('flush')) {
        response += `Three of a suit on board. Anyone with two of that suit has a flush. One card? Flush draw.\n\nIf you don't have it: Be careful. They might.\nIf you do have it: Value bet, but watch for full houses if board pairs.`;
      } else if (texture.includes('paired')) {
        response += `Paired board. Full houses possible now.\n\nOverpairs are less valuable here - they lose to trips, full houses, quads. Check more often with one pair hands.`;
      } else if (texture.includes('connected')) {
        response += `Connected board - lots of straights possible.\n\nSets are vulnerable here. If you have a set, bet big to charge draws. If you have one pair, tread carefully.`;
      } else {
        response += `Dry board - not many draws possible.\n\nThis is where top pair plays well. You can value bet thinner because draws don't beat you.`;
      }

      return response;
    }

    // Equity questions
    if (q.includes('odds') || q.includes('equity') || q.includes('percent') || q.includes('%')) {
      const potOdds = toCall > 0 ? (toCall / (hand.pot + toCall) * 100) : 0;
      return `Let's think about this.\n\nPot: ${hand.pot.toFixed(1)}bb. You need ${toCall.toFixed(1)}bb to call.\n\nThat's ${potOdds.toFixed(0)}% pot odds - you need ${potOdds.toFixed(0)}% equity to break even.\n\nNow the question: does ${notation} have ${potOdds.toFixed(0)}%+ equity against their range?\n\nAgainst a tight range (AA-TT, AK): probably not.\nAgainst a loose range (any pair, any draw): probably yes.\n\nWhat do you think they have?`;
    }

    // Range questions
    if (q.includes('range')) {
      if (villains.length === 0) {
        return "Everyone folded, so their ranges don't matter anymore. You win!";
      }
      const v = villains[0];
      const profile = PLAYER_PROFILES[v.playerType];

      if (v.playerType === 'NIT' || v.playerType === 'TAG') {
        return `${v.name} is tight. Think top 15% of hands: big pairs (AA-TT), big aces (AK-AJ), suited broadways.\n\nIf they're betting here, narrow it down more. What hands bet like this? Usually value-heavy.`;
      } else if (v.playerType === 'LAG' || v.playerType === 'MANIAC') {
        return `${v.name} plays wide. Could be anything that connects with the board, any draw, any pair, or pure air.\n\nTheir range is hard to narrow. Focus on your hand strength instead - do you beat enough of their bluffs?`;
      } else {
        return `${v.name} is playing reasonable ranges. Think standard stuff - pairs, broadways, suited connectors.\n\nNarrow their range based on the action. Did they raise preflop? From what position? That tells you a lot.`;
      }
    }

    // General catch-all that still teaches
    return `Let me ask you this - what specifically are you unsure about?\n\nIs it:\n• What they have? (Ask about their range)\n• What your hand is worth? (Ask about equity)\n• Whether to bet/call/fold? (Ask "what should I do")\n\nThe more specific your question, the better I can help.`;
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
