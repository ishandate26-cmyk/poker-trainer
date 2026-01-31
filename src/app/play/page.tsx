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
  outs: number;
} {
  const isSuited = heroCards[0].suit === heroCards[1].suit;
  const heroSuit = isSuited ? heroCards[0].suit : null;

  if (board.length === 0) {
    const notation = cardsToHandNotation(heroCards);
    const isPair = heroCards[0].rank === heroCards[1].rank;
    const highRanks = ['A', 'K', 'Q', 'J', 'T'];
    const hasHighCard = highRanks.includes(heroCards[0].rank) || highRanks.includes(heroCards[1].rank);

    if (isPair && ['A', 'K', 'Q', 'J', 'T'].includes(heroCards[0].rank)) {
      return { made: 'premium pair', draws: [], strength: 'strong', outs: 0 };
    }
    if (isPair) {
      return { made: 'pocket pair', draws: [], strength: 'medium', outs: 0 };
    }
    if (notation === 'AKs' || notation === 'AKo') {
      return { made: 'big slick', draws: [], strength: 'strong', outs: 0 };
    }
    if (hasHighCard && isSuited) {
      return { made: 'suited broadway', draws: ['flush potential'], strength: 'medium', outs: 0 };
    }
    if (hasHighCard) {
      return { made: 'high cards', draws: [], strength: 'medium', outs: 0 };
    }
    if (isSuited) {
      return { made: 'suited cards', draws: ['flush potential'], strength: 'draw', outs: 0 };
    }
    return { made: 'speculative', draws: [], strength: 'weak', outs: 0 };
  }

  const fullHand = [...heroCards, ...board];
  const evaluation = evaluateHand(fullHand);
  const draws: string[] = [];
  let totalOuts = 0;

  // Check for flush draw - ONLY if hero has suited cards that match board cards
  if (isSuited && heroSuit) {
    const boardSuitCount = board.filter(c => c.suit === heroSuit).length;
    const totalSuitCount = boardSuitCount + 2; // hero has 2 of this suit

    if (totalSuitCount === 4) {
      draws.push('flush draw');
      totalOuts += 9;
    } else if (totalSuitCount === 3 && board.length <= 3) {
      draws.push('backdoor flush draw');
    }
  }

  // Check for straight draws
  const rankOrder = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const rankValues = fullHand.map(c => rankOrder.indexOf(c.rank));
  const uniqueRanks = [...new Set(rankValues)].sort((a, b) => a - b);

  // Better straight draw detection
  let hasOESD = false;
  let hasGutshot = false;

  // Check for 4 cards within 5 rank span (OESD or gutshot)
  for (let i = 0; i < uniqueRanks.length - 3; i++) {
    const span = uniqueRanks[i + 3] - uniqueRanks[i];
    if (span === 3) {
      // 4 consecutive = OESD
      hasOESD = true;
      break;
    } else if (span === 4) {
      // 4 within 5 = gutshot
      hasGutshot = true;
    }
  }

  // Also check wheel draw (A-2-3-4-5)
  if (uniqueRanks.includes(12)) { // Has Ace
    const lowRanks = uniqueRanks.filter(r => r <= 3 || r === 12);
    if (lowRanks.length >= 4) {
      hasOESD = true;
    }
  }

  if (hasOESD && evaluation.rank < 4) { // Don't count if already have straight
    draws.push('open-ended straight draw');
    totalOuts += 8;
  } else if (hasGutshot && evaluation.rank < 4) {
    draws.push('gutshot');
    totalOuts += 4;
  }

  // Hand rankings: 0=high card, 1=pair, 2=two pair, 3=trips, 4=straight, 5=flush, 6=full house, 7=quads, 8=straight flush
  let strength: 'strong' | 'medium' | 'weak' | 'draw' = 'weak';
  if (evaluation.rank >= 2) strength = 'strong'; // two pair or better is strong
  else if (evaluation.rank === 1) strength = 'medium'; // one pair
  else if (draws.length > 0) strength = 'draw';

  return {
    made: evaluation.rankName,
    draws,
    strength,
    outs: totalOuts
  };
}

// Coach helps you think through YOUR hand - no villain cards revealed
function getCoachAnalysis(
  hand: HandState,
  hero: PlayerState,
  toCall: number
): string {
  const heroNotation = cardsToHandNotation(hero.cards);
  const heroCards = `${hero.cards[0].rank}${hero.cards[0].suit} ${hero.cards[1].rank}${hero.cards[1].suit}`;
  const villains = hand.players.filter(p => !p.isFolded && !p.isHero);
  const mainVillain = villains[0];
  const board = hand.board;
  const heroAnalysis = analyzeHandStrength(hero.cards, board);

  const parts: string[] = [];

  // PREFLOP
  if (board.length === 0) {
    parts.push(`**Your hand:** ${heroNotation}`);

    if (mainVillain) {
      const profile = PLAYER_PROFILES[mainVillain.playerType];
      parts.push(`**${mainVillain.name}** (${mainVillain.position}) - ${profile.name}`);

      if (toCall > 0) {
        parts.push(`\nThey raised to ${hand.currentBet.toFixed(1)}bb. What's your play?`);
      }
    }
    return parts.join('\n');
  }

  // POSTFLOP
  const boardStr = board.map(c => `${c.rank}${c.suit}`).join(' ');
  const heroEval = evaluateHand([...hero.cards, ...board]);

  parts.push(`**Board:** ${boardStr}`);
  parts.push(`**Your hand:** ${heroCards} → **${heroEval.rankName}**`);

  if (heroAnalysis.draws.length > 0) {
    parts.push(`**Draws:** ${heroAnalysis.draws.join(', ')} (${heroAnalysis.outs} outs)`);
  }

  // What we know about villain's range
  if (mainVillain) {
    const profile = PLAYER_PROFILES[mainVillain.playerType];
    parts.push('');

    if (toCall > 0) {
      const potOdds = (toCall / (hand.pot + toCall) * 100);
      parts.push(`**${mainVillain.name} bets ${(hand.currentBet - hero.currentBet).toFixed(1)}bb** into ${hand.pot.toFixed(1)}bb`);
      parts.push(`You need ${potOdds.toFixed(0)}% equity to call.`);

      // Advice based on hand strength
      if (heroAnalysis.strength === 'strong') {
        parts.push(`\n✓ You have a strong hand. Raise for value or call to trap.`);
      } else if (heroAnalysis.strength === 'medium') {
        if (mainVillain.playerType === 'LAG' || mainVillain.playerType === 'MANIAC') {
          parts.push(`\n? ${mainVillain.name} bluffs a lot. Your medium hand might be good.`);
        } else if (mainVillain.playerType === 'NIT' || mainVillain.playerType === 'TAG') {
          parts.push(`\n? ${mainVillain.name} is tight - they usually have it. Fold?`);
        } else {
          parts.push(`\n? Medium hand. Depends on your read.`);
        }
      } else if (heroAnalysis.strength === 'draw') {
        const equity = hand.street === 'flop' ? heroAnalysis.outs * 4 : heroAnalysis.outs * 2;
        if (equity > potOdds) {
          parts.push(`\n✓ You have ${equity}% equity with your draw. Pot odds (${potOdds.toFixed(0)}%) are good - CALL.`);
        } else {
          parts.push(`\n✗ You have ${equity}% equity. Pot odds (${potOdds.toFixed(0)}%) are thin. Fold or semi-bluff raise.`);
        }
      } else {
        parts.push(`\n✗ Weak hand. Fold unless you're sure they're bluffing.`);
      }
    } else {
      // Checked to us
      parts.push(`**Checked to you.** Pot: ${hand.pot.toFixed(1)}bb`);

      if (heroAnalysis.strength === 'strong') {
        parts.push(`\n✓ Strong hand - bet ${(hand.pot * 0.66).toFixed(1)}bb for value.`);
      } else if (heroAnalysis.strength === 'medium') {
        if (mainVillain.playerType === 'FISH' || mainVillain.playerType === 'CALLING_STATION') {
          parts.push(`\n? ${mainVillain.name} calls too much. Bet small for value.`);
        } else {
          parts.push(`\n? Check for pot control, or bet small.`);
        }
      } else if (heroAnalysis.strength === 'draw') {
        parts.push(`\n? Draw - semi-bluff ${(hand.pot * 0.5).toFixed(1)}bb or check for free card.`);
      } else {
        parts.push(`\n✗ Weak hand. Check.`);
      }
    }
  }

  return parts.join('\n');
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

    // Get coaching analysis (YOUR hand only - no villain cards)
    const advice = getCoachAnalysis(hand, hero, toCall);

    // Show the advice
    coachSays(advice);
    setWaitingForAction(true);
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

    // Board analysis - YOUR hand only
    const boardStr = currentHand.board.map(c => c.rank + c.suit).join(' ');
    const hero = currentHand.players.find(p => p.isHero)!;
    const heroEval = evaluateHand([...hero.cards, ...currentHand.board]);
    const heroAnalysis = analyzeHandStrength(hero.cards, currentHand.board);
    const texture = analyzeBoardTexture(currentHand.board);

    let commentary = `**${currentHand.street.toUpperCase()}:** ${boardStr}\n`;
    commentary += `*${texture} board*\n\n`;
    commentary += `You have **${heroEval.rankName}**`;
    if (heroAnalysis.draws.length > 0) {
      commentary += ` + ${heroAnalysis.draws.join(' + ')} (${heroAnalysis.outs} outs)`;
    }

    coachSays(commentary);

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
      cards: `${p.cards[0].rank}${p.cards[0].suit} ${p.cards[1].rank}${p.cards[1].suit}`,
    }));

    evaluations.sort((a, b) => b.hand.score - a.hand.score);

    const winner = evaluations[0];
    const hero = evaluations.find(e => e.player.isHero);
    const heroWon = winner.player.isHero;

    let showdownMsg = `**🎴 SHOWDOWN!**\n\n`;
    showdownMsg += `**Board:** ${hand.board.map(c => c.rank + c.suit).join(' ')}\n\n`;

    evaluations.forEach(e => {
      const isWinner = e === winner;
      const prefix = isWinner ? '👑 ' : '   ';
      showdownMsg += `${prefix}**${e.player.name}:** ${e.cards} → **${e.hand.rankName}**\n`;
    });

    showdownMsg += `\n`;
    if (heroWon) {
      showdownMsg += `🎉 **Hero takes it!** +${hand.pot.toFixed(1)}bb with ${winner.hand.rankName}!`;
    } else {
      showdownMsg += `💀 **${winner.player.name} wins** ${hand.pot.toFixed(1)}bb with ${winner.hand.rankName}.`;
      if (hero) {
        showdownMsg += `\n\nHero's ${hero.hand.rankName} wasn't enough.`;
      }
    }

    coachSays(showdownMsg);

    setTimeout(() => endHand(hand, heroWon ? 'win' : 'lose'), 1000);
  }, [coachSays]);

  // ============ END HAND ============
  const endHand = useCallback((hand: HandState, result: 'win' | 'lose' | 'fold') => {
    const hero = hand.players.find(p => p.isHero)!;
    const notation = cardsToHandNotation(hero.cards);

    // Mark hand as complete
    const completedHand = { ...hand, street: 'complete' as Street };
    setGame(prev => ({ ...prev, hand: completedHand }));
    setWaitingForAction(false);

    let summary = result === 'win'
      ? `You win ${hand.pot.toFixed(1)}bb!`
      : result === 'lose'
        ? `You lose this hand.`
        : `You folded ${notation}.`;

    coachSays(summary);

    setTimeout(() => {
      let feedback = '';
      if (result === 'fold') {
        feedback = `Folding ${notation} - sometimes the right play. Think about whether you had the odds to continue, and what you were up against.\n\nClick "Deal Next Hand" below to continue.`;
      } else if (result === 'win') {
        feedback = `Nice! Review: could you have extracted more value? Or was pot control the right approach?\n\nClick "Deal Next Hand" to continue.`;
      } else {
        feedback = `Tough spot. Was there a street where you could've gotten away cheaper, or was this just a cooler?\n\nClick "Deal Next Hand" to continue.`;
      }
      coachSays(feedback);
    }, 800);
  }, [coachSays]);

  // ============ INITIALIZE ============
  useEffect(() => {
    coachSays("Welcome to Live Training. We'll play full hands and I'll coach you through each decision.\n\nClick 'Deal Me In' below to start.");
  }, []);

  // Track last topic for follow-up questions
  const lastTopicRef = useRef<string>('general');

  // ============ ANSWER QUESTION ============
  const answerQuestion = useCallback((question: string, hand: HandState): string => {
    const q = question.toLowerCase().trim();
    const hero = hand.players.find(p => p.isHero)!;
    const heroNotation = cardsToHandNotation(hero.cards);
    const heroCards = `${hero.cards[0].rank}${hero.cards[0].suit} ${hero.cards[1].rank}${hero.cards[1].suit}`;
    const villains = hand.players.filter(p => !p.isFolded && !p.isHero);
    const board = hand.board;
    const toCall = hand.currentBet - hero.currentBet;
    const mainVillain = villains[0];
    const heroAnalysis = analyzeHandStrength(hero.cards, board);
    const heroEval = board.length > 0 ? evaluateHand([...hero.cards, ...board]) : null;

    // Helper: check if question contains any of these words
    const hasAny = (...words: string[]) => words.some(w => q.includes(w));

    // Helper: give full situation breakdown (NO villain cards)
    const getFullBreakdown = () => {
      let response = `**YOUR SITUATION:**\n\n`;

      response += `**Your hand:** ${heroCards} (${heroNotation})\n`;
      if (board.length > 0) {
        response += `**Made:** ${heroEval!.rankName}`;
        if (heroAnalysis.draws.length > 0) {
          response += ` + ${heroAnalysis.draws.join(', ')} (${heroAnalysis.outs} outs)`;
        }
        response += `\n`;
        response += `**Board:** ${board.map(c => c.rank + c.suit).join(' ')}\n`;
      }

      if (mainVillain) {
        const profile = PLAYER_PROFILES[mainVillain.playerType];
        response += `\n**${mainVillain.name}:** ${profile.name}`;
        if (mainVillain.playerType === 'LAG' || mainVillain.playerType === 'MANIAC') {
          response += ` (bluffs often)`;
        } else if (mainVillain.playerType === 'NIT' || mainVillain.playerType === 'TAG') {
          response += ` (tight, usually has it)`;
        } else if (mainVillain.playerType === 'FISH' || mainVillain.playerType === 'CALLING_STATION') {
          response += ` (calls everything)`;
        }
        response += `\n`;
      }

      if (toCall > 0) {
        const potOdds = (toCall / (hand.pot + toCall) * 100);
        response += `\n**Action:** ${toCall.toFixed(1)}bb to call into ${hand.pot.toFixed(1)}bb (${potOdds.toFixed(0)}% pot odds)\n`;

        if (heroAnalysis.outs > 0) {
          const equity = hand.street === 'flop' ? heroAnalysis.outs * 4 : heroAnalysis.outs * 2;
          response += `**Your equity:** ${heroAnalysis.outs} outs = ~${equity}%\n`;
          response += equity > potOdds ? `✅ You have odds to call.\n` : `❌ You don't have direct odds.\n`;
        }
      } else {
        response += `\n**Action:** Checked to you. Pot: ${hand.pot.toFixed(1)}bb\n`;
      }

      // Recommendation
      response += `\n**→ `;
      if (heroAnalysis.strength === 'strong') {
        response += toCall > 0 ? `RAISE or CALL**` : `BET for value**`;
      } else if (heroAnalysis.strength === 'medium') {
        response += toCall > 0 ? `CALL vs bluffers, FOLD vs tight**` : `CHECK or small bet**`;
      } else if (heroAnalysis.strength === 'draw') {
        if (toCall > 0) {
          const equity = hand.street === 'flop' ? heroAnalysis.outs * 4 : heroAnalysis.outs * 2;
          const potOdds = (toCall / (hand.pot + toCall) * 100);
          response += equity > potOdds ? `CALL (have odds)**` : `FOLD or semi-bluff RAISE**`;
        } else {
          response += `Semi-bluff or CHECK**`;
        }
      } else {
        response += toCall > 0 ? `FOLD**` : `CHECK**`;
      }

      return response;
    };

    // === OUTS / EQUITY / MATH ===
    if (hasAny('outs', 'equity', 'calculate', 'math', 'draw', 'percent', '%')) {
      let response = `**YOUR OUTS & EQUITY:**\n\n`;

      response += `**Hand:** ${heroNotation} → ${heroEval?.rankName || heroAnalysis.made}\n`;

      if (heroAnalysis.outs > 0) {
        response += `\n**Draws:**\n`;
        if (heroAnalysis.draws.includes('flush draw')) response += `• Flush draw = 9 outs\n`;
        if (heroAnalysis.draws.includes('open-ended straight draw')) response += `• OESD = 8 outs\n`;
        if (heroAnalysis.draws.includes('gutshot')) response += `• Gutshot = 4 outs\n`;

        const equity = hand.street === 'flop' ? heroAnalysis.outs * 4 : heroAnalysis.outs * 2;
        response += `\n**Calculation:**\n`;
        response += `${heroAnalysis.outs} outs × ${hand.street === 'flop' ? '4' : '2'} = **~${equity}% equity**\n`;

        if (toCall > 0) {
          const potOdds = (toCall / (hand.pot + toCall) * 100);
          response += `\n**Pot odds:** ${potOdds.toFixed(0)}%\n`;
          response += equity > potOdds
            ? `✅ Your equity (${equity}%) > pot odds (${potOdds.toFixed(0)}%) → **CALL**`
            : `❌ Your equity (${equity}%) < pot odds (${potOdds.toFixed(0)}%) → **FOLD** or semi-bluff`;
        } else {
          response += `\nNo bet to call. Semi-bluff or check for free card.`;
        }
      } else {
        response += `\n**No draws.** You have a made hand (${heroAnalysis.strength}).`;
        if (heroAnalysis.strength === 'strong') {
          response += `\n\n✓ Strong hand - bet for value.`;
        } else if (heroAnalysis.strength === 'medium') {
          response += `\n\n? Medium hand - check or bet small.`;
        } else {
          response += `\n\n✗ Weak hand - check/fold.`;
        }
      }

      return response;
    }

    // === SIMPLE / BREAK DOWN / STATUS ===
    if (hasAny('simpler', 'simple', 'basic', 'eli5', 'status', 'where', 'stand', 'break')) {
      // Quick summary - YOUR hand only
      let response = `**Your hand:** ${heroNotation}`;

      if (heroEval) {
        response += ` → **${heroEval.rankName}**`;
      }

      if (heroAnalysis.draws.length > 0) {
        const equity = hand.street === 'flop' ? heroAnalysis.outs * 4 : heroAnalysis.outs * 2;
        response += `\n**Draw:** ${heroAnalysis.draws.join(' + ')} = ${equity}%`;
      }

      response += `\n\n`;

      if (toCall > 0) {
        const potOdds = (toCall / (hand.pot + toCall) * 100);
        if (heroAnalysis.strength === 'strong') {
          response += `✓ Strong hand. RAISE or CALL.`;
        } else if (heroAnalysis.strength === 'draw' && heroAnalysis.outs > 0) {
          const equity = hand.street === 'flop' ? heroAnalysis.outs * 4 : heroAnalysis.outs * 2;
          response += equity > potOdds
            ? `✓ Draw with odds (${equity}% vs ${potOdds.toFixed(0)}%). CALL.`
            : `✗ Draw without odds. FOLD or semi-bluff.`;
        } else if (heroAnalysis.strength === 'medium') {
          response += `? Medium hand. Depends on villain.`;
        } else {
          response += `✗ Weak. FOLD.`;
        }
      } else {
        if (heroAnalysis.strength === 'strong') {
          response += `✓ Strong hand. BET for value.`;
        } else if (heroAnalysis.strength === 'draw') {
          response += `? Draw. Semi-bluff or check.`;
        } else {
          response += `? CHECK.`;
        }
      }

      return response;
    }

    // === FOLLOW-UP QUESTIONS (short/vague) ===
    if (q.length < 10 || hasAny('why?', 'more', 'huh', 'what?', '?')) {
      // Give contextual follow-up based on last topic
      if (lastTopicRef.current === 'bluff') {
        return `Because tight players fold. That's it.\n\nIf someone folds 60% of the time, and you bet 1bb to win 2bb, you profit even if your bluff never works when called.\n\nFish don't fold. So don't bluff them. Just bet when you have good hands.`;
      }
      if (lastTopicRef.current === 'odds') {
        return `Here's the simple version:\n\nPot is ${hand.pot.toFixed(1)}bb. You need to put in ${toCall.toFixed(1)}bb.\n\nAsk: "If I call 100 times, do I win enough pots to profit?"\n\nWith a flush draw you win about 35 times. So if 35 × pot > 100 × call, it's profitable.`;
      }
      // Default: just give the full breakdown
      return getFullBreakdown();
    }

    // === HOW TO THINK / DECIDE ===
    if (hasAny('how to think', 'how should i think', 'how do i decide', 'what to do', 'how to approach', 'help me decide', 'what should i do')) {
      let response = `**Step-by-step for this hand:**\n\n`;

      response += `**1. Your hand:** ${heroNotation}\n`;
      response += `• Made: ${heroAnalysis.made}\n`;
      if (heroAnalysis.draws.length > 0) {
        response += `• Draws: ${heroAnalysis.draws.join(', ')} (${heroAnalysis.outs} outs)\n`;
      }
      response += `• Strength: **${heroAnalysis.strength.toUpperCase()}**\n\n`;

      response += `**2. The action:**\n`;
      if (toCall > 0) {
        const potOdds = (toCall / (hand.pot + toCall) * 100);
        response += `• Facing ${toCall.toFixed(1)}bb bet into ${hand.pot.toFixed(1)}bb\n`;
        response += `• Pot odds: ${potOdds.toFixed(0)}%\n`;
        if (heroAnalysis.outs > 0) {
          const equity = hand.street === 'flop' ? heroAnalysis.outs * 4 : heroAnalysis.outs * 2;
          response += `• Your equity: ${equity}%\n`;
        }
        response += `\n`;

        response += `**3. Decision:**\n`;
        if (heroAnalysis.strength === 'strong') {
          response += `Strong hand → **RAISE** for value or **CALL** to trap.`;
        } else if (heroAnalysis.strength === 'medium') {
          const villainBluffs = mainVillain?.playerType === 'LAG' || mainVillain?.playerType === 'MANIAC';
          response += `Medium hand → ${villainBluffs ? '**CALL** (villain bluffs)' : '**FOLD** (villain is tight)'}`;
        } else if (heroAnalysis.strength === 'draw') {
          const equity = hand.street === 'flop' ? heroAnalysis.outs * 4 : heroAnalysis.outs * 2;
          response += `Draw (${equity}% equity) → ${equity > potOdds ? '**CALL** (equity > pot odds)' : '**FOLD** or semi-bluff **RAISE**'}`;
        } else {
          response += `Weak hand → **FOLD**`;
        }
      } else {
        response += `• Checked to you, pot is ${hand.pot.toFixed(1)}bb\n\n`;
        response += `**3. Decision:**\n`;
        if (heroAnalysis.strength === 'strong') {
          response += `Strong hand → **BET ${(hand.pot * 0.66).toFixed(1)}bb** for value`;
        } else if (heroAnalysis.strength === 'draw') {
          response += `Draw → **BET ${(hand.pot * 0.5).toFixed(1)}bb** as semi-bluff or **CHECK** for free card`;
        } else if (heroAnalysis.strength === 'medium') {
          response += `Medium hand → **CHECK** for pot control or small bet`;
        } else {
          response += `Weak hand → **CHECK**`;
        }
      }

      return response;
    }

    // === HOW QUESTIONS (math/mechanics) ===
    if (hasAny('how do', 'how should', 'how to', 'how can', 'how did', 'how does', 'how is', 'what\'s the math', 'calculate')) {
      lastTopicRef.current = 'odds';

      if (hasAny('pot odds', 'odds', 'math', 'percent', '%', 'equity', 'ev', 'expected')) {
        if (toCall === 0) {
          return `No bet facing you. Pot odds don't apply.\n\nYou're deciding whether to bet (for value or as a bluff) or check.\n\nWith ${heroAnalysis.made}, ${heroAnalysis.strength === 'strong' ? 'bet for value.' : heroAnalysis.strength === 'medium' ? 'bet small or check.' : 'check.'}`;
        }
        const odds = hand.pot / toCall;
        return `Simple pot odds:\n\nPot: ${hand.pot.toFixed(1)}bb. Call: ${toCall.toFixed(1)}bb.\n\nYou're getting ${odds.toFixed(1)}:1 odds.\n\nFlush draw needs 4:1 (hits ~20% of time).\nOESD needs 5:1 (hits ~17% of time).\n\nYour ${heroNotation}: ${heroAnalysis.draws.length > 0 ? `You have ${heroAnalysis.draws.join(', ')}. ${odds > 4 ? 'Odds are good.' : 'Odds are thin.'}` : `No draw. You need to beat their hand to win.`}`;
      }

      if (hasAny('bet', 'check', 'sizing', 'size')) {
        return `When to bet vs check:\n\n**Bet** when:\n- You have a good hand (get value)\n- You have nothing but they'll fold (bluff)\n\n**Check** when:\n- You have a medium hand (control pot)\n- They bet into you a lot (trap them)\n\nYou have ${heroAnalysis.made}. ${heroAnalysis.strength === 'strong' ? 'Bet.' : heroAnalysis.strength === 'medium' ? 'Could go either way.' : 'Check.'}`;
      }

      // Generic how
      return `What specifically do you want to know how to do?\n\nTry: "how do I calculate odds" or "how do I decide what to do"`;
    }

    // === BET VS CHECK QUESTIONS ===
    if (hasAny('bet or check', 'check or bet', 'betting vs', 'should i bet', 'should i check', 'bet here', 'check here')) {
      lastTopicRef.current = 'betting';

      let response = `**Bet vs Check Framework:**\n\n`;
      response += `**BET when:**\n• Worse hands call (value)\n• Better hands fold (bluff)\n• You deny equity to draws\n\n`;
      response += `**CHECK when:**\n• You can't handle a raise\n• Villain will bluff if you check\n• Nothing worse calls anyway\n\n`;

      response += `**Your ${heroNotation}:** ${heroAnalysis.strength}. `;
      if (heroAnalysis.strength === 'strong') {
        response += `Bet for value. What sizing gets called by worse?`;
      } else if (heroAnalysis.strength === 'medium') {
        response += `Tricky. If villain is a calling station, bet thin. If aggressive, check-call.`;
      } else if (heroAnalysis.strength === 'draw') {
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
    if (hasAny('why fold', 'why call', 'why raise', 'why bet', 'why check', 'why not', 'why should', 'why would', 'why vs', 'why tight', 'why loose', 'why bluff', 'why value')) {
      lastTopicRef.current = 'why';

      // Why vs tight players (bluffing)
      if (hasAny('tight')) {
        return `Tight players fold a lot. That's why you bluff them.\n\nThink about it: If I bet $10 to win $15, and they fold half the time, I profit $7.50 every time on average, even if I have nothing.\n\nAgainst a fish who never folds? That same bluff loses money. They call and you lose $10.\n\nSo: Bluff tight players. Value bet fish.`;
      }

      // Why vs loose players
      if (hasAny('loose', 'fish', 'station')) {
        return `Loose players call too much. So don't bluff them.\n\nIf they call your bluff, you lose the bet. If they call your value bet, you win their chips.\n\nAgainst fish: Bet every time you have something decent. They'll pay you off. Never bluff - they won't fold.`;
      }

      if (hasAny('fold')) {
        return `You fold when your hand isn't good enough to continue.\n\nRight now you have ${heroAnalysis.made}. Ask: "What hands does villain have that I beat?"\n\nIf mostly better hands, fold. If lots of bluffs, call.\n\n${mainVillain ? (mainVillain.playerType === 'NIT' ? `${mainVillain.name} is tight - they usually have it. Folding is fine.` : `${mainVillain.name} bluffs more - maybe worth a call.`) : ''}`;
      }
      if (hasAny('raise', 'bet')) {
        return `You bet for two reasons:\n\n1. VALUE - You have a good hand. You bet because worse hands call and give you money.\n\n2. BLUFF - You have nothing. You bet to make better hands fold.\n\nWith ${heroAnalysis.made}, ${heroAnalysis.strength === 'strong' ? 'you\'re betting for value. What worse hands can call?' : heroAnalysis.strength === 'weak' ? 'you\'d be bluffing. Will villain fold?' : 'it\'s somewhere in between.'}`;
      }
      if (hasAny('call')) {
        return `You call when:\n\n1. You might be ahead (villain could be bluffing)\n2. You have a draw with good odds\n3. You want to trap an aggressive player\n\nYou have ${heroAnalysis.made}. ${heroAnalysis.strength === 'strong' ? 'This is strong - consider raising instead.' : heroAnalysis.strength === 'draw' ? 'You\'re drawing - check if the odds work.' : 'This is weak - are you sure villain is bluffing?'}`;
      }
      if (hasAny('check')) {
        return `You check when:\n\n1. Your hand isn't strong enough to bet for value\n2. You want to trap (check-raise)\n3. You want a free card to improve\n\nWith ${heroAnalysis.made}, ${heroAnalysis.strength === 'strong' ? 'checking is leaving money on the table. Bet!' : 'checking makes sense - keep the pot small.'}`;
      }
      if (hasAny('bluff')) {
        lastTopicRef.current = 'bluff';
        return `You bluff to make better hands fold.\n\nIt works when:\n- Villain folds a lot (tight player)\n- Board is scary (looks like you could have a big hand)\n- You have blockers to their strong hands\n\nIt fails when:\n- Villain calls everything (fish)\n- You've been caught bluffing recently\n- Board connects with their range\n\n${mainVillain ? (mainVillain.playerType === 'FISH' || mainVillain.playerType === 'CALLING_STATION' ? `Don't bluff ${mainVillain.name}. They call.` : mainVillain.playerType === 'NIT' ? `${mainVillain.name} folds a lot. Good bluff target.` : '') : ''}`;
      }

      return `What specifically do you want to know why about? Ask "why fold" or "why bet" and I'll explain.`;
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
    if (hasAny('should i', 'what do i', 'what should', 'what\'s the play', 'help', 'advice', 'recommend', 'best play', 'correct play', 'what now', 'do here', 'action')) {
      lastTopicRef.current = 'action';
      return getFullBreakdown();
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

      response += `\n\n**Your ${heroNotation}:** ${heroAnalysis.made}${heroAnalysis.draws.length > 0 ? ` + ${heroAnalysis.draws.join(', ')}` : ''}`;

      return response;
    }

    // === BLUFFING / FOLD EQUITY ===
    if (hasAny('bluff', 'fold equity', 'semi-bluff', 'semibluff', 'should i bluff', 'when to bluff', 'how to bluff')) {
      lastTopicRef.current = 'bluff';

      let response = `**Bluffing Framework:**\n\n`;
      response += `**Fold Equity** = how often villain folds to your bet.\n`;
      response += `**Showdown Equity** = how often you win at showdown.\n\n`;

      response += `**When to bluff:**\n`;
      response += `• Villain is tight/nitty (high fold equity)\n`;
      response += `• Board is scary (flushes, straights possible)\n`;
      response += `• You have blockers to their strong hands\n`;
      response += `• You have outs if called (semi-bluff)\n\n`;

      response += `**When NOT to bluff:**\n`;
      response += `• Villain is a calling station\n`;
      response += `• Board is dry (hard to rep anything)\n`;
      response += `• Multiple players in pot\n\n`;

      if (mainVillain) {
        if (mainVillain.playerType === 'FISH' || mainVillain.playerType === 'CALLING_STATION') {
          response += `**vs ${mainVillain.name}:** Don't bluff! They call everything. Only value bet.`;
        } else if (mainVillain.playerType === 'NIT' || mainVillain.playerType === 'TAG') {
          response += `**vs ${mainVillain.name}:** Good bluff target. They fold a lot. Bet scary boards.`;
        } else if (mainVillain.playerType === 'LAG' || mainVillain.playerType === 'MANIAC') {
          response += `**vs ${mainVillain.name}:** Risky to bluff - they might re-bluff. Better to trap.`;
        }
      }

      return response;
    }

    // === SHOWDOWN VALUE / EQUITY ===
    if (hasAny('showdown', 'my equity', 'hand equity', 'how much equity', 'calculate equity', 'win percent')) {
      lastTopicRef.current = 'equity';

      let response = `**Your Equity with ${heroNotation}:**\n\n`;

      if (board.length === 0) {
        response += `**Preflop equity (approximate):**\n`;
        if (heroAnalysis.strength === 'strong') {
          response += `• vs random hand: ~65-85%\n`;
          response += `• vs tight range (top 10%): ~40-60%\n`;
        } else if (heroAnalysis.strength === 'medium') {
          response += `• vs random hand: ~50-60%\n`;
          response += `• vs tight range: ~30-45%\n`;
        } else {
          response += `• vs random hand: ~35-50%\n`;
          response += `• vs tight range: ~25-35%\n`;
        }
      } else {
        response += `**Made hand:** ${heroAnalysis.made}\n`;
        if (heroAnalysis.draws.length > 0) {
          response += `**Draws:** ${heroAnalysis.draws.join(', ')}\n`;
          response += `\n**Draw equities:**\n`;
          if (heroAnalysis.draws.includes('flush draw')) {
            response += `• Flush draw: ~35% (9 outs × 4)\n`;
          }
          if (heroAnalysis.draws.includes('open-ended straight draw')) {
            response += `• Open-ender: ~32% (8 outs × 4)\n`;
          }
          if (heroAnalysis.draws.includes('gutshot')) {
            response += `• Gutshot: ~17% (4 outs × 4)\n`;
          }
        }
        response += `\n**Strength:** ${heroAnalysis.strength.toUpperCase()}\n`;
      }

      response += `\n**Remember:** Equity changes based on villain's range. Against tight = lower. Against loose = higher.`;

      return response;
    }

    // === RULES / HOW POKER WORKS ===
    if (hasAny('blind', 'why don\'t', 'don\'t they', 'dont they', 'rules', 'how does', 'why do', 'what is a', 'what\'s a')) {
      lastTopicRef.current = 'rules';

      if (hasAny('blind')) {
        return `**Blinds Explained:**\n\n• Small Blind (SB): Posts 0.5bb, acts first postflop\n• Big Blind (BB): Posts 1bb, acts last preflop\n\n**Why blinds exist:** To create action! Without blinds, everyone would just wait for AA.\n\n**Blind defense:** BB already has 1bb invested, so they defend wider. SB is in worst position, plays tighter.\n\n**In this hand:** The blinds posted their forced bets. Other players folded to you. Now you decide.`;
      }

      if (hasAny('position')) {
        return `**Position Explained:**\n\n• **Early position** (UTG, HJ): Act first, play tight\n• **Middle** (CO): Can open wider\n• **Late** (BTN): Best spot, play widest\n• **Blinds**: Forced to post, worst position postflop\n\n**Why it matters:** Acting LAST lets you see what others do before deciding. Information = power.`;
      }

      if (hasAny('pot odds')) {
        return `**Pot Odds Explained:**\n\nPot odds = Risk ÷ (Pot + Risk)\n\nIf pot is 10bb and you need to call 5bb:\n5 ÷ 15 = 33%\n\nYou need 33%+ equity to call profitably.\n\n**Quick rule:** If your draw hits ~1/3 of the time and pot odds are ~33%, it's breakeven. Better odds = call. Worse = fold.`;
      }

      return `**Poker Basics:**\n\n• Each player gets 2 cards (hole cards)\n• 5 community cards: Flop (3), Turn (1), River (1)\n• Best 5-card hand wins\n• Betting rounds: Preflop, Flop, Turn, River\n\nWhat specific rule are you asking about?`;
    }

    // === ODDS/EQUITY/BET SIZING ===
    if (hasAny('odds', 'equity', 'percent', '%', 'ev', 'expected value', 'profitable', 'math', 'sizing', 'bet size', 'how much')) {
      lastTopicRef.current = 'odds';

      // When no bet to call - talk about BET SIZING, not pot odds
      if (toCall === 0) {
        let response = `**Bet Sizing (when betting, not calling):**\n\n`;
        response += `You have ${heroNotation} = **${heroAnalysis.made}** (${heroAnalysis.strength})\n\n`;

        if (heroAnalysis.strength === 'strong') {
          response += `**Strong hand - bet for VALUE.**\n\n`;
          response += `• Small bet (33-50% pot): Get called by more hands\n`;
          response += `• Medium bet (50-75% pot): Balance of value and protection\n`;
          response += `• Big bet (75-100%+ pot): Max value vs calling stations, protection vs draws\n\n`;
          response += `**Pot is ${hand.pot.toFixed(1)}bb.** With ${heroAnalysis.made}, I'd bet ${(hand.pot * 0.6).toFixed(1)}-${(hand.pot * 0.75).toFixed(1)}bb for value.`;
        } else if (heroAnalysis.strength === 'medium') {
          response += `**Medium hand - pot control or thin value.**\n\n`;
          response += `• Check: Keep pot small, get to showdown cheaply\n`;
          response += `• Small bet (25-40% pot): Thin value vs worse, fold out draws\n\n`;
          response += `Against a calling station: bet small for value.\nAgainst aggressive player: check, let them bluff.`;
        } else if (heroAnalysis.strength === 'draw') {
          response += `**Drawing hand - semi-bluff or check.**\n\n`;
          response += `• Semi-bluff (50-75% pot): Win now OR hit your draw\n`;
          response += `• Check: See free card, disguise hand strength\n\n`;
          response += `Semi-bluff works better vs tight players who fold. Check vs calling stations.`;
        } else {
          response += `**Weak hand - check or bluff.**\n\n`;
          response += `• Check: Give up, see free card\n`;
          response += `• Bluff (50-75% pot): Only if villain folds a lot\n\n`;
          response += `Don't bluff calling stations. They call.`;
        }

        return response;
      }

      // Facing a bet - show pot odds
      const potOdds = (toCall / (hand.pot + toCall) * 100);
      return `**Pot Odds:**\n\n${toCall.toFixed(1)}bb to call / ${(hand.pot + toCall).toFixed(1)}bb total = **${potOdds.toFixed(0)}%**\n\nYou need ${potOdds.toFixed(0)}%+ equity to call profitably.\n\n**Your ${heroNotation} = ${heroAnalysis.made}:**\n${heroAnalysis.strength === 'strong' ? '✓ Strong - you\'re ahead of most betting ranges. Raise for value or call to trap.' : heroAnalysis.strength === 'medium' ? '? Medium - depends on villain. Call vs bluffers, fold vs tight players.' : heroAnalysis.strength === 'draw' ? `? Draw - need ~${heroAnalysis.draws.includes('flush draw') ? '35%' : '17-32%'} equity. ${potOdds < 35 ? 'Odds look OK.' : 'Odds are thin.'}` : '✗ Weak - probably fold unless you\'re sure they\'re bluffing.'}`;
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
        response += `**Your question:** Does ${heroNotation} beat their value range?`;
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

      let response = `**Your Hand: ${heroNotation}**\n\n`;
      response += `**Made hand:** ${heroAnalysis.made}\n`;
      if (heroAnalysis.draws.length > 0) {
        response += `**Draws:** ${heroAnalysis.draws.join(', ')}\n`;
      }
      response += `**Strength:** ${heroAnalysis.strength.toUpperCase()}\n\n`;

      if (heroAnalysis.strength === 'strong') {
        response += `This is a value hand. Build the pot, get paid.`;
      } else if (heroAnalysis.strength === 'medium') {
        response += `Medium - tricky. Pot control or thin value depending on villain.`;
      } else if (heroAnalysis.strength === 'draw') {
        response += `Drawing hand. Check odds, consider semi-bluff.`;
      } else {
        response += `Weak. Check/fold or bluff if villain is tight.`;
      }

      return response;
    }

    // === CATCH-ALL: Give full breakdown for anything unclear ===
    lastTopicRef.current = 'general';
    return getFullBreakdown();
  }, []);

  // ============ RESPONSE HANDLER (chat only - buttons are in left panel) ============
  const handleResponse = useCallback((response: string, isCustom = false) => {
    // Chat is only for questions now - all actions handled by buttons in left panel
    if (game.hand) {
      addMessage('user', response);
      const answer = answerQuestion(response, game.hand);
      coachSays(answer);
    }
  }, [game.hand, coachSays, answerQuestion, addMessage]);

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

          {/* Action buttons - ALWAYS visible when hero's turn */}
          {waitingForAction && hand && hero && (
            <div className="bg-gray-900 p-4 rounded-xl space-y-3">
              <div className="text-sm text-gray-400 mb-2">
                {hand.currentBet > hero.currentBet
                  ? `${(hand.currentBet - hero.currentBet).toFixed(1)}bb to call into ${hand.pot.toFixed(1)}bb pot`
                  : `Pot: ${hand.pot.toFixed(1)}bb. Your action.`}
              </div>

              {/* Main action buttons */}
              <div className="flex flex-wrap gap-2">
                {hand.currentBet > hero.currentBet ? (
                  <>
                    <button
                      onClick={() => handleHeroAction('Fold')}
                      className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg font-medium"
                    >
                      Fold
                    </button>
                    <button
                      onClick={() => handleHeroAction(`Call ${(hand.currentBet - hero.currentBet).toFixed(1)}bb`)}
                      className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg font-medium"
                    >
                      Call {(hand.currentBet - hero.currentBet).toFixed(1)}bb
                    </button>
                    <button
                      onClick={() => handleHeroAction(`Raise ${(hand.currentBet * 3).toFixed(1)}bb`)}
                      className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg font-medium"
                    >
                      Raise to {(hand.currentBet * 3).toFixed(1)}bb
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleHeroAction('Check')}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium"
                    >
                      Check
                    </button>
                    <button
                      onClick={() => handleHeroAction(`Bet ${(hand.pot * 0.5).toFixed(1)}bb`)}
                      className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg font-medium"
                    >
                      Bet {(hand.pot * 0.5).toFixed(1)}bb (½ pot)
                    </button>
                    <button
                      onClick={() => handleHeroAction(`Bet ${hand.pot.toFixed(1)}bb`)}
                      className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg font-medium"
                    >
                      Bet {hand.pot.toFixed(1)}bb (pot)
                    </button>
                  </>
                )}
              </div>

              {/* Custom bet input */}
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={customBet}
                  onChange={(e) => setCustomBet(e.target.value)}
                  placeholder="Custom"
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-2 w-20 text-white"
                />
                <span className="text-sm text-gray-400">bb</span>
                <button
                  onClick={() => {
                    if (customBet) {
                      handleHeroAction(`Bet ${customBet}bb`);
                    }
                  }}
                  disabled={!customBet}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 rounded-lg font-medium"
                >
                  Custom Bet
                </button>
                <button
                  onClick={() => setGame(prev => ({ ...prev, showRange: !prev.showRange }))}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium ml-auto"
                >
                  {game.showRange ? 'Hide Range' : 'Show Range'}
                </button>
              </div>
            </div>
          )}

          {/* Deal button when hand is over */}
          {!waitingForAction && hand && hand.street === 'complete' && (
            <div className="bg-gray-900 p-4 rounded-xl">
              <button
                onClick={() => startNewHand()}
                className="w-full px-4 py-3 bg-green-700 hover:bg-green-600 rounded-lg font-medium text-lg"
              >
                Deal Next Hand
              </button>
            </div>
          )}

          {/* Initial deal button */}
          {!hand && (
            <div className="bg-gray-900 p-4 rounded-xl">
              <button
                onClick={() => startNewHand()}
                className="w-full px-4 py-3 bg-green-700 hover:bg-green-600 rounded-lg font-medium text-lg"
              >
                Deal Me In
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
                  ? `${hero.position} vs ${hand.lastAggressorPosition} open`
                  : `${hero.position} Opening Range`}
              </h3>
              <RangeGrid
                selectedHands={getRangeToShow()}
                highlightHands={getHighlightHands()}
                heroHand={cardsToHandNotation(hero.cards)}
                readOnly
              />
              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 bg-pink-500 rounded ring-2 ring-white"></div>
                  <span className="text-gray-300">Your hand</span>
                </div>
                {hand?.street === 'preflop' && hand.lastAggressorPosition ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 bg-green-600 rounded"></div>
                      <span className="text-gray-300">3-bet</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 bg-yellow-600 rounded"></div>
                      <span className="text-gray-300">Call</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 bg-yellow-600 rounded"></div>
                    <span className="text-gray-300">Open/Raise</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 bg-gray-700 rounded"></div>
                  <span className="text-gray-300">Fold</span>
                </div>
              </div>
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
