'use client';

import { useState } from 'react';

interface FeedbackSection {
  title: string;
  content: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface CoachingFeedbackProps {
  isCorrect: boolean;
  sections: FeedbackSection[];
  thinkingPrompts?: string[];
  className?: string;
}

export function CoachingFeedback({ isCorrect, sections, thinkingPrompts, className = '' }: CoachingFeedbackProps) {
  const [expanded, setExpanded] = useState(true);

  const typeColors = {
    success: 'border-green-500 bg-green-900/20',
    error: 'border-red-500 bg-red-900/20',
    info: 'border-blue-500 bg-blue-900/20',
    warning: 'border-yellow-500 bg-yellow-900/20',
  };

  const typeIcons = {
    success: '✓',
    error: '✗',
    info: 'ℹ',
    warning: '⚠',
  };

  return (
    <div className={`rounded-lg border-2 ${isCorrect ? 'border-green-500' : 'border-red-500'} overflow-hidden ${className}`}>
      {/* Header */}
      <div
        className={`px-4 py-3 ${isCorrect ? 'bg-green-900/30' : 'bg-red-900/30'} flex justify-between items-center cursor-pointer`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className={`text-2xl ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
            {isCorrect ? '✓' : '✗'}
          </span>
          <span className="text-lg font-bold">
            {isCorrect ? 'Correct!' : 'Not quite right'}
          </span>
        </div>
        <span className="text-gray-400">{expanded ? '▼' : '▶'}</span>
      </div>

      {/* Content */}
      {expanded && (
        <div className="p-4 space-y-4 bg-gray-900/50">
          {sections.map((section, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border-l-4 ${typeColors[section.type]}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`
                  ${section.type === 'success' ? 'text-green-400' : ''}
                  ${section.type === 'error' ? 'text-red-400' : ''}
                  ${section.type === 'info' ? 'text-blue-400' : ''}
                  ${section.type === 'warning' ? 'text-yellow-400' : ''}
                `}>
                  {typeIcons[section.type]}
                </span>
                <h4 className="font-semibold text-white">{section.title}</h4>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed">{section.content}</p>
            </div>
          ))}

          {/* Thinking Prompts - key for learning */}
          {thinkingPrompts && thinkingPrompts.length > 0 && (
            <div className="mt-4 p-4 bg-indigo-900/30 rounded-lg border border-indigo-500">
              <h4 className="font-semibold text-indigo-300 mb-2">
                Questions to internalize:
              </h4>
              <ul className="space-y-2">
                {thinkingPrompts.map((prompt, index) => (
                  <li key={index} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5">→</span>
                    <span>{prompt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Quick result indicator
interface QuickResultProps {
  isCorrect: boolean;
  yourAnswer: string;
  correctAnswer: string;
  accuracy?: number;
}

export function QuickResult({ isCorrect, yourAnswer, correctAnswer, accuracy }: QuickResultProps) {
  return (
    <div className={`p-4 rounded-lg ${isCorrect ? 'bg-green-900/30 border border-green-500' : 'bg-red-900/30 border border-red-500'}`}>
      <div className="flex justify-between items-center mb-2">
        <span className={`text-lg font-bold ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
          {isCorrect ? 'Correct!' : 'Incorrect'}
        </span>
        {accuracy !== undefined && (
          <span className="text-sm text-gray-400">
            Accuracy: {accuracy.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-400">Your answer:</span>
          <div className="font-mono text-white">{yourAnswer}</div>
        </div>
        <div>
          <span className="text-gray-400">Correct answer:</span>
          <div className="font-mono text-white">{correctAnswer}</div>
        </div>
      </div>
    </div>
  );
}

// Session stats component
interface SessionStatsProps {
  correct: number;
  total: number;
  streak: number;
  averageAccuracy?: number;
}

export function SessionStats({ correct, total, streak, averageAccuracy }: SessionStatsProps) {
  const percentage = total > 0 ? ((correct / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="flex gap-4 text-sm">
      <div className="px-3 py-1 bg-gray-800 rounded-lg">
        <span className="text-gray-400">Score: </span>
        <span className="text-white font-mono">{correct}/{total}</span>
        <span className="text-gray-500"> ({percentage}%)</span>
      </div>
      {streak > 1 && (
        <div className="px-3 py-1 bg-orange-900/50 rounded-lg border border-orange-500">
          <span className="text-orange-400">🔥 {streak} streak</span>
        </div>
      )}
      {averageAccuracy !== undefined && (
        <div className="px-3 py-1 bg-gray-800 rounded-lg">
          <span className="text-gray-400">Avg accuracy: </span>
          <span className="text-white font-mono">{averageAccuracy.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

// Thinking time tracker
interface ThinkingTimerProps {
  startTime: number | null;
  showTimer?: boolean;
}

export function ThinkingTimer({ startTime, showTimer = true }: ThinkingTimerProps) {
  const [time, setTime] = useState(0);

  // Update timer
  useState(() => {
    if (!startTime || !showTimer) return;

    const interval = setInterval(() => {
      setTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  });

  if (!showTimer || !startTime) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="text-sm text-gray-500">
      Thinking: {formatTime(time)}
    </div>
  );
}

// Difficulty rating
interface DifficultyBadgeProps {
  level: 'easy' | 'medium' | 'hard' | 'expert';
}

export function DifficultyBadge({ level }: DifficultyBadgeProps) {
  const colors = {
    easy: 'bg-green-600 text-green-100',
    medium: 'bg-yellow-600 text-yellow-100',
    hard: 'bg-orange-600 text-orange-100',
    expert: 'bg-red-600 text-red-100',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${colors[level]}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}
