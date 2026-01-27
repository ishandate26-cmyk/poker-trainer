'use client';

import { Card, suitSymbol, suitColor, Suit, Rank } from '@/lib/deck';

interface PlayingCardProps {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  highlight?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-10 h-14 text-sm',
  md: 'w-14 h-20 text-lg',
  lg: 'w-20 h-28 text-2xl',
};

export function PlayingCard({ card, size = 'md', faceDown = false, highlight = false, className = '' }: PlayingCardProps) {
  const color = suitColor(card.suit);
  const symbol = suitSymbol(card.suit);

  if (faceDown) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-lg border-2 border-gray-600 bg-gradient-to-br from-blue-800 to-blue-900 flex items-center justify-center shadow-lg ${className}`}
      >
        <div className="text-blue-400 opacity-30 text-4xl">?</div>
      </div>
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-lg border-2 ${highlight ? 'border-yellow-400 ring-2 ring-yellow-400' : 'border-gray-300'} bg-white flex flex-col items-center justify-center shadow-lg relative ${className}`}
    >
      <div className={`font-bold ${color === 'red' ? 'text-red-600' : 'text-gray-900'}`}>
        {card.rank}
      </div>
      <div className={`${color === 'red' ? 'text-red-600' : 'text-gray-900'}`}>
        {symbol}
      </div>
      {/* Corner indicators */}
      <div className={`absolute top-1 left-1 text-xs leading-none ${color === 'red' ? 'text-red-600' : 'text-gray-900'}`}>
        {card.rank}
        <br />
        {symbol}
      </div>
    </div>
  );
}

// Component to display a card slot (empty position)
interface CardSlotProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function CardSlot({ size = 'md', className = '' }: CardSlotProps) {
  return (
    <div
      className={`${sizeClasses[size]} rounded-lg border-2 border-dashed border-gray-500 bg-gray-800/50 flex items-center justify-center ${className}`}
    >
      <span className="text-gray-500 text-xl">?</span>
    </div>
  );
}

// Simple card representation for range grids
interface MiniCardProps {
  rank: Rank;
  suit?: Suit;
  className?: string;
}

export function MiniCard({ rank, suit, className = '' }: MiniCardProps) {
  const color = suit ? suitColor(suit) : 'black';
  const symbol = suit ? suitSymbol(suit) : '';

  return (
    <span className={`font-mono ${color === 'red' ? 'text-red-500' : 'text-white'} ${className}`}>
      {rank}{symbol}
    </span>
  );
}
