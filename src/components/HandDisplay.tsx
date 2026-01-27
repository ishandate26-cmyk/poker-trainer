'use client';

import { Card, cardsToHandNotation, suitSymbol, suitColor } from '@/lib/deck';
import { PlayingCard } from './PlayingCard';

interface HandDisplayProps {
  cards: [Card, Card];
  size?: 'sm' | 'md' | 'lg';
  showNotation?: boolean;
  label?: string;
  className?: string;
}

export function HandDisplay({ cards, size = 'md', showNotation = true, label, className = '' }: HandDisplayProps) {
  const notation = cardsToHandNotation(cards);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {label && (
        <div className="text-sm text-gray-400 mb-1">{label}</div>
      )}
      <div className="flex gap-1">
        <PlayingCard card={cards[0]} size={size} />
        <PlayingCard card={cards[1]} size={size} />
      </div>
      {showNotation && (
        <div className="mt-2 text-lg font-mono font-bold text-white">
          {notation}
        </div>
      )}
    </div>
  );
}

// Text-only hand display for inline use
interface HandTextProps {
  cards: [Card, Card];
  className?: string;
}

export function HandText({ cards, className = '' }: HandTextProps) {
  return (
    <span className={`font-mono ${className}`}>
      <span className={suitColor(cards[0].suit) === 'red' ? 'text-red-500' : 'text-white'}>
        {cards[0].rank}{suitSymbol(cards[0].suit)}
      </span>
      <span className={suitColor(cards[1].suit) === 'red' ? 'text-red-500' : 'text-white'}>
        {cards[1].rank}{suitSymbol(cards[1].suit)}
      </span>
    </span>
  );
}

// Position indicator
interface PositionIndicatorProps {
  position: string;
  isHero?: boolean;
  className?: string;
}

export function PositionIndicator({ position, isHero = false, className = '' }: PositionIndicatorProps) {
  const positionColors: Record<string, string> = {
    UTG: 'bg-red-600',
    HJ: 'bg-orange-600',
    CO: 'bg-yellow-600',
    BTN: 'bg-green-600',
    SB: 'bg-blue-600',
    BB: 'bg-purple-600',
  };

  return (
    <div
      className={`
        inline-flex items-center justify-center px-3 py-1 rounded-full
        text-sm font-bold ${positionColors[position] || 'bg-gray-600'}
        ${isHero ? 'ring-2 ring-white' : ''}
        ${className}
      `}
    >
      {position}
      {isHero && <span className="ml-1 text-xs">(You)</span>}
    </div>
  );
}

// Stack size display
interface StackDisplayProps {
  stackBB: number;
  className?: string;
}

export function StackDisplay({ stackBB, className = '' }: StackDisplayProps) {
  const stackColor = stackBB < 20 ? 'text-red-400' :
    stackBB < 50 ? 'text-yellow-400' :
      stackBB < 100 ? 'text-green-400' : 'text-emerald-400';

  return (
    <span className={`font-mono ${stackColor} ${className}`}>
      {stackBB}bb
    </span>
  );
}

// Pot odds display
interface PotOddsDisplayProps {
  potSize: number;
  betSize: number;
  currency?: string;
}

export function PotOddsDisplay({ potSize, betSize, currency = 'bb' }: PotOddsDisplayProps) {
  const totalPot = potSize + betSize;
  const odds = ((betSize / totalPot) * 100).toFixed(1);
  const ratio = (totalPot / betSize).toFixed(1);

  return (
    <div className="text-sm text-gray-300">
      <div>Pot: {potSize}{currency} | To call: {betSize}{currency}</div>
      <div>
        Pot odds: <span className="text-yellow-400">{odds}%</span> ({ratio}:1)
      </div>
    </div>
  );
}
