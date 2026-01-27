'use client';

import { Card, suitSymbol, suitColor } from '@/lib/deck';
import { PlayerType, PLAYER_PROFILES } from '@/lib/player-types';
import { PlayingCard } from './PlayingCard';

export interface TableSeat {
  position: string;
  playerType: PlayerType;
  stack: number;
  isHero: boolean;
  cards?: [Card, Card];
  isFolded: boolean;
  currentBet: number;
  isActive: boolean;
  lastAction?: string;
  name: string;
}

interface LiveTableProps {
  seats: TableSeat[];
  board: Card[];
  pot: number;
  heroPosition: string;
  activePosition?: string;
  onSeatClick?: (position: string) => void;
}

// Position coordinates for 6-max table (percentages)
const SEAT_POSITIONS_6MAX: Record<string, { x: number; y: number }> = {
  BTN: { x: 85, y: 65 },
  SB: { x: 70, y: 85 },
  BB: { x: 30, y: 85 },
  UTG: { x: 15, y: 65 },
  HJ: { x: 15, y: 35 },
  CO: { x: 85, y: 35 },
};

// Player type to avatar style
const PLAYER_AVATARS: Record<PlayerType, { emoji: string; color: string }> = {
  TAG: { emoji: '🎯', color: 'bg-blue-600' },
  LAG: { emoji: '🔥', color: 'bg-orange-600' },
  NIT: { emoji: '🐢', color: 'bg-gray-600' },
  FISH: { emoji: '🐟', color: 'bg-cyan-600' },
  MANIAC: { emoji: '🃏', color: 'bg-red-600' },
  CALLING_STATION: { emoji: '📞', color: 'bg-yellow-600' },
  REG: { emoji: '💼', color: 'bg-purple-600' },
  UNKNOWN: { emoji: '❓', color: 'bg-gray-700' },
};

export function LiveTable({ seats, board, pot, heroPosition, activePosition, onSeatClick }: LiveTableProps) {
  return (
    <div className="relative w-full aspect-[16/10] max-w-3xl mx-auto">
      {/* Table felt */}
      <div className="absolute inset-4 bg-gradient-to-br from-green-800 to-green-900 rounded-[50%] border-8 border-amber-900 shadow-2xl">
        {/* Table rail */}
        <div className="absolute inset-0 rounded-[50%] border-4 border-amber-800/50" />

        {/* Pot display */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[120%] text-center">
          {pot > 0 && (
            <div className="bg-black/40 rounded-full px-4 py-1">
              <span className="text-yellow-400 font-bold">Pot: {pot.toFixed(1)} BB</span>
            </div>
          )}
        </div>

        {/* Community cards */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1">
          {board.length > 0 ? (
            board.map((card, i) => (
              <PlayingCard key={`${card.rank}${card.suit}`} card={card} size="sm" />
            ))
          ) : (
            <div className="text-gray-500 text-sm">No cards dealt</div>
          )}
        </div>
      </div>

      {/* Player seats */}
      {seats.map((seat) => {
        const pos = SEAT_POSITIONS_6MAX[seat.position];
        if (!pos) return null;

        const avatar = PLAYER_AVATARS[seat.playerType];
        const isActive = seat.position === activePosition;
        const profile = PLAYER_PROFILES[seat.playerType];

        return (
          <div
            key={seat.position}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            onClick={() => onSeatClick?.(seat.position)}
          >
            {/* Player card */}
            <div
              className={`
                relative p-2 rounded-xl min-w-[100px] text-center transition-all
                ${seat.isFolded ? 'opacity-40' : ''}
                ${isActive ? 'ring-2 ring-yellow-400 scale-110' : ''}
                ${seat.isHero ? 'bg-blue-900/90 border-2 border-blue-400' : 'bg-gray-900/90 border border-gray-700'}
              `}
            >
              {/* Position badge */}
              <div className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs font-bold ${
                seat.position === 'BTN' ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-white'
              }`}>
                {seat.position}
              </div>

              {/* Avatar and name */}
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-8 h-8 rounded-full ${avatar.color} flex items-center justify-center text-lg`}>
                  {seat.isHero ? '👤' : avatar.emoji}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">
                    {seat.isHero ? 'You' : seat.name}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {seat.isHero ? seat.position : profile.name.split(' ')[0]}
                  </div>
                </div>
              </div>

              {/* Stack */}
              <div className="text-sm font-mono text-green-400">
                {seat.stack.toFixed(0)} BB
              </div>

              {/* Cards (hero only, unless showdown) */}
              {seat.cards && seat.isHero && !seat.isFolded && (
                <div className="flex gap-0.5 justify-center mt-1">
                  <PlayingCard card={seat.cards[0]} size="sm" />
                  <PlayingCard card={seat.cards[1]} size="sm" />
                </div>
              )}

              {/* Last action */}
              {seat.lastAction && (
                <div className={`mt-1 text-xs font-semibold ${
                  seat.lastAction === 'FOLD' ? 'text-gray-500' :
                  seat.lastAction.includes('RAISE') || seat.lastAction.includes('BET') ? 'text-red-400' :
                  seat.lastAction === 'CHECK' ? 'text-blue-400' : 'text-yellow-400'
                }`}>
                  {seat.lastAction}
                </div>
              )}

              {/* Current bet */}
              {seat.currentBet > 0 && !seat.isFolded && (
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-yellow-600 text-black text-xs px-2 py-0.5 rounded-full font-bold">
                  {seat.currentBet.toFixed(1)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Generate realistic player names
const PLAYER_NAMES = [
  'Mike_NYC', 'PokerPro99', 'AA_Always', 'FishHunter', 'Bluff_King',
  'TightIsRight', 'LooseGoose', 'RiverRat', 'ChipLeader', 'Donkey42',
  'SharkyMark', 'NittyGritty', 'ActionJack', 'CallingCathy', 'BetBetBet',
];

export function generatePlayerName(): string {
  return PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
}
