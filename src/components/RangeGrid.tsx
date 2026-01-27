'use client';

import { useState, useMemo } from 'react';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

interface RangeGridProps {
  selectedHands?: string[];
  onSelectionChange?: (hands: string[]) => void;
  readOnly?: boolean;
  highlightHands?: string[];
  heroHand?: string;
  className?: string;
  showPercentage?: boolean;
}

export function RangeGrid({
  selectedHands = [],
  onSelectionChange,
  readOnly = false,
  highlightHands = [],
  heroHand,
  className = '',
  showPercentage = true,
}: RangeGridProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'add' | 'remove' | null>(null);

  const selectedSet = useMemo(() => new Set(selectedHands), [selectedHands]);
  const highlightSet = useMemo(() => new Set(highlightHands), [highlightHands]);

  // Calculate percentage of hands selected
  const totalCombos = useMemo(() => {
    let combos = 0;
    for (const hand of selectedHands) {
      if (hand.length === 2) combos += 6; // Pairs
      else if (hand.endsWith('s')) combos += 4; // Suited
      else combos += 12; // Offsuit
    }
    return combos;
  }, [selectedHands]);

  const percentage = ((totalCombos / 1326) * 100).toFixed(1);

  const getHandNotation = (row: number, col: number): string => {
    const r1 = RANKS[row];
    const r2 = RANKS[col];

    if (row === col) return `${r1}${r2}`; // Pair
    if (row < col) return `${r1}${r2}s`; // Suited (above diagonal)
    return `${r2}${r1}o`; // Offsuit (below diagonal)
  };

  const getCellColor = (hand: string): string => {
    const isSelected = selectedSet.has(hand);
    const isHighlighted = highlightSet.has(hand);
    const isHero = hand === heroHand;

    if (isHero) return 'bg-pink-500 text-black font-bold ring-2 ring-white';
    if (isHighlighted && isSelected) return 'bg-green-600 text-white';
    if (isHighlighted) return 'bg-blue-600 text-white';
    if (isSelected) return 'bg-yellow-600 text-black';

    // Default colors based on hand type
    if (hand.length === 2) return 'bg-gray-700 hover:bg-gray-600'; // Pair
    if (hand.endsWith('s')) return 'bg-gray-800 hover:bg-gray-700'; // Suited
    return 'bg-gray-900 hover:bg-gray-800'; // Offsuit
  };

  const handleCellMouseDown = (hand: string) => {
    if (readOnly) return;

    setIsDragging(true);
    const isSelected = selectedSet.has(hand);
    setDragMode(isSelected ? 'remove' : 'add');

    const newSelection = isSelected
      ? selectedHands.filter(h => h !== hand)
      : [...selectedHands, hand];

    onSelectionChange?.(newSelection);
  };

  const handleCellMouseEnter = (hand: string) => {
    if (!isDragging || readOnly || !dragMode) return;

    const isSelected = selectedSet.has(hand);

    if (dragMode === 'add' && !isSelected) {
      onSelectionChange?.([...selectedHands, hand]);
    } else if (dragMode === 'remove' && isSelected) {
      onSelectionChange?.(selectedHands.filter(h => h !== hand));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragMode(null);
  };

  return (
    <div
      className={`select-none ${className}`}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {showPercentage && (
        <div className="text-center mb-2 text-sm text-gray-400">
          Range: {percentage}% ({totalCombos} combos)
        </div>
      )}
      <div className="grid grid-cols-13 gap-0.5 p-1 bg-gray-950 rounded-lg">
        {RANKS.map((_, row) =>
          RANKS.map((_, col) => {
            const hand = getHandNotation(row, col);
            return (
              <div
                key={hand}
                className={`
                  w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center
                  text-[10px] sm:text-xs font-mono rounded-sm
                  transition-colors duration-75
                  ${getCellColor(hand)}
                  ${!readOnly ? 'cursor-pointer' : ''}
                `}
                onMouseDown={() => handleCellMouseDown(hand)}
                onMouseEnter={() => handleCellMouseEnter(hand)}
              >
                {hand}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Preset ranges for quick selection
export const PRESET_RANGES: Record<string, string[]> = {
  'Premium': ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo'],
  'Top 10%': [
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88',
    'AKs', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs',
    'AKo', 'AQo',
  ],
  'Top 20%': [
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s', '65s',
    'AKo', 'AQo', 'AJo', 'ATo', 'KQo', 'KJo', 'QJo',
  ],
  'Wide': [
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s',
    'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s',
    'JTs', 'J9s', 'J8s', 'J7s',
    'T9s', 'T8s', 'T7s',
    '98s', '97s', '96s',
    '87s', '86s',
    '76s', '75s',
    '65s', '64s',
    '54s', '53s',
    '43s',
    'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o',
    'KQo', 'KJo', 'KTo', 'K9o',
    'QJo', 'QTo', 'Q9o',
    'JTo', 'J9o',
    'T9o',
  ],
};

interface RangeSelectorProps {
  selectedRange: string[];
  onRangeChange: (hands: string[]) => void;
}

export function RangeSelector({ selectedRange, onRangeChange }: RangeSelectorProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {Object.entries(PRESET_RANGES).map(([name, hands]) => (
          <button
            key={name}
            onClick={() => onRangeChange(hands)}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
          >
            {name}
          </button>
        ))}
        <button
          onClick={() => onRangeChange([])}
          className="px-3 py-1 text-sm bg-red-700 hover:bg-red-600 rounded-md transition-colors"
        >
          Clear
        </button>
      </div>
      <RangeGrid
        selectedHands={selectedRange}
        onSelectionChange={onRangeChange}
      />
    </div>
  );
}
