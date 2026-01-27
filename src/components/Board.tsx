'use client';

import { Card } from '@/lib/deck';
import { PlayingCard, CardSlot } from './PlayingCard';

interface BoardProps {
  cards: Card[];
  size?: 'sm' | 'md' | 'lg';
  showSlots?: boolean;
  highlightCards?: number[];
  className?: string;
}

export function Board({ cards, size = 'md', showSlots = true, highlightCards = [], className = '' }: BoardProps) {
  const totalSlots = 5;
  const displayCards = showSlots ? [...cards, ...Array(totalSlots - cards.length).fill(null)] : cards;

  return (
    <div className={`flex gap-2 justify-center ${className}`}>
      {displayCards.map((card, index) => (
        card ? (
          <PlayingCard
            key={`${card.rank}${card.suit}`}
            card={card}
            size={size}
            highlight={highlightCards.includes(index)}
          />
        ) : (
          <CardSlot key={`slot-${index}`} size={size} />
        )
      ))}
    </div>
  );
}

// Board texture analysis display
interface BoardTextureProps {
  cards: Card[];
}

export function BoardTexture({ cards }: BoardTextureProps) {
  if (cards.length < 3) return null;

  const suits = cards.map(c => c.suit);
  const ranks = cards.map(c => c.rank);

  // Check for flush draws
  const suitCounts = suits.reduce((acc, s) => {
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const maxSuitCount = Math.max(...Object.values(suitCounts));
  const hasFlushDraw = maxSuitCount >= 3;
  const hasFlush = maxSuitCount >= 5;

  // Check for pairs
  const rankCounts = ranks.reduce((acc, r) => {
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const paired = Object.values(rankCounts).some(c => c >= 2);
  const trips = Object.values(rankCounts).some(c => c >= 3);

  // Texture description
  const textures: string[] = [];

  if (hasFlush) textures.push('Flush possible');
  else if (hasFlushDraw) textures.push('Flush draw');

  if (trips) textures.push('Trips on board');
  else if (paired) textures.push('Paired board');

  // Check for connectivity
  const rankValues = cards.map(c => '23456789TJQKA'.indexOf(c.rank));
  const sortedRanks = [...new Set(rankValues)].sort((a, b) => a - b);

  let maxGap = 0;
  for (let i = 1; i < sortedRanks.length; i++) {
    maxGap = Math.max(maxGap, sortedRanks[i] - sortedRanks[i - 1]);
  }

  const spread = sortedRanks[sortedRanks.length - 1] - sortedRanks[0];

  if (spread <= 4 && sortedRanks.length >= 3) textures.push('Connected');
  else if (spread >= 8) textures.push('Rainbow/Dry');

  // High card texture
  const highCards = ranks.filter(r => 'AKQJ'.includes(r)).length;
  if (highCards >= 2) textures.push('Broadway heavy');
  else if (highCards === 0) textures.push('Low board');

  return (
    <div className="text-sm text-gray-400 mt-2">
      <span className="font-semibold">Texture:</span>{' '}
      {textures.length > 0 ? textures.join(' | ') : 'Standard'}
    </div>
  );
}
