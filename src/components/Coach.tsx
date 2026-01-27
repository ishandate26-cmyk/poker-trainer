'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';

export interface CoachMessage {
  id: string;
  type: 'coach' | 'user' | 'thinking' | 'reveal';
  content: string;
  options?: string[];
  waitingForResponse?: boolean;
}

interface CoachProps {
  messages: CoachMessage[];
  onResponse: (response: string, isCustom?: boolean) => void;
  isThinking?: boolean;
  coachName?: string;
  allowFreeText?: boolean;
}

export function Coach({ messages, onResponse, isThinking = false, coachName = 'Coach', allowFreeText = true }: CoachProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const lastMessageId = useRef<string | null>(null);

  const lastMessage = messages[messages.length - 1];
  const showOptions = lastMessage?.waitingForResponse && lastMessage?.options;

  // Reset selected option when a new question appears
  useEffect(() => {
    if (lastMessage?.id !== lastMessageId.current) {
      lastMessageId.current = lastMessage?.id || null;
      setSelectedOption(null);
    }
  }, [lastMessage?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = () => {
    if (inputValue.trim() && !isThinking) {
      onResponse(inputValue.trim(), true);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleOptionClick = (option: string) => {
    if (selectedOption === null && !isThinking) {
      setSelectedOption(option);
      onResponse(option, false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : message.type === 'thinking'
                  ? 'bg-yellow-900/30 border border-yellow-600 text-yellow-100 italic'
                  : message.type === 'reveal'
                  ? 'bg-green-900/30 border border-green-600 text-green-100'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              <div className="whitespace-pre-wrap text-[15px]">{message.content}</div>
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-gray-800 space-y-3">
        {/* Quick options */}
        {showOptions && (
          <div className="flex flex-wrap gap-2">
            {lastMessage.options!.map((option) => (
              <button
                key={option}
                onClick={() => handleOptionClick(option)}
                disabled={selectedOption !== null || isThinking}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  selectedOption === option
                    ? 'bg-blue-600 text-white'
                    : selectedOption !== null || isThinking
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {/* Free text input */}
        {allowFreeText && (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything... (why? explain? what if?)"
              disabled={isThinking}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={!inputValue.trim() || isThinking}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-full font-medium transition"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Human-like coach responses - SHORT and PUNCHY
export const COACH_VOICE = {
  // Acknowledgments - vary these
  ack: [
    "Yeah.",
    "Right.",
    "Okay.",
    "Got it.",
    "Sure.",
    "Mm-hmm.",
  ],

  // When they ask "why"
  why: [
    "Good question.",
    "Fair ask.",
    "Let me break it down.",
    "Here's the thing:",
  ],

  // Simplifying
  simpler: [
    "Okay, simpler:",
    "Put it this way:",
    "Bottom line:",
    "Think of it like this:",
  ],

  // Encouragement (not over the top)
  good: [
    "There you go.",
    "Now you're thinking.",
    "Exactly.",
    "That's it.",
    "Yep.",
  ],

  // Gentle correction
  notQuite: [
    "Not quite.",
    "Close, but...",
    "Eh, not really.",
    "Sort of, but...",
    "Let me push back:",
  ],

  // Moving on
  moveOn: [
    "Anyway.",
    "Moving on.",
    "Next hand?",
    "Let's keep going.",
    "Ready?",
  ],
};

// Get random from array
export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Answer common questions with human-like responses
export function answerQuestion(question: string, context: {
  hand?: string;
  position?: string;
  villainType?: string;
  action?: string;
}): string | null {
  const q = question.toLowerCase();

  // "Why" questions
  if (q.includes('why')) {
    if (q.includes('fold')) {
      return `${pick(COACH_VOICE.why)} ${context.hand || 'This hand'} doesn't have the equity to continue. You'd be lighting money on fire.`;
    }
    if (q.includes('raise') || q.includes('open')) {
      return `${pick(COACH_VOICE.why)} ${context.hand || 'This hand'} has playability - it can make strong hands and it's got fold equity. From ${context.position || 'here'}, that's enough.`;
    }
    if (q.includes('call')) {
      return `${pick(COACH_VOICE.why)} It's got enough equity to see a flop, but not enough to raise for value. We're set-mining basically.`;
    }
    if (q.includes('3bet') || q.includes('3-bet')) {
      return `${pick(COACH_VOICE.why)} Two reasons: we have equity if called, and we have fold equity. Plus we block some of their continuing range.`;
    }
  }

  // "What if" questions
  if (q.includes('what if')) {
    if (q.includes('position') || q.includes('button') || q.includes('utg')) {
      return `${pick(COACH_VOICE.simpler)} Better position = wider range. On the button you can open way more trash because you act last postflop. UTG? Tighten up.`;
    }
    if (q.includes('tight') || q.includes('nit')) {
      return `Against a nit? Fold more when they show aggression. They're only betting with the goods. But steal their blinds all day.`;
    }
    if (q.includes('loose') || q.includes('fish') || q.includes('maniac')) {
      return `Against a maniac? Tighten up preflop, then let them hang themselves. Value bet relentlessly. Don't bluff - they don't fold.`;
    }
  }

  // Asking for simpler explanation
  if (q.includes('simpler') || q.includes('eli5') || q.includes("don't understand") || q.includes('confused') || q.includes('explain')) {
    if (context.action === 'fold') {
      return `${pick(COACH_VOICE.simpler)} Bad hand + bad position = fold. Don't overthink it.`;
    }
    if (context.action === 'open') {
      return `${pick(COACH_VOICE.simpler)} Good enough hand + good enough position = raise it up. Take the pot or build one.`;
    }
    if (context.action === '3bet') {
      return `${pick(COACH_VOICE.simpler)} They raised, you re-raise. Either they fold (you win) or they call (you have a good hand). Win-win.`;
    }
    return `${pick(COACH_VOICE.simpler)} Think: can I win this pot? If yes, play. If no, fold. Don't get fancy.`;
  }

  // Range questions
  if (q.includes('range') || q.includes('what hands')) {
    if (context.villainType === 'NIT') {
      return `A nit? They're playing like top 10% of hands. AA, KK, QQ, AK... that's basically it.`;
    }
    if (context.villainType === 'FISH') {
      return `A fish plays everything. Any ace, any pair, suited junk, you name it. Their range is huge.`;
    }
    if (context.villainType === 'LAG') {
      return `LAGs open wide - could be anything. But when they 3-bet, give them some credit. They're aggro but not stupid.`;
    }
    return `Standard range from ${context.position || 'there'}? Pairs, broadway, suited connectors. Tighter early, wider late.`;
  }

  // Equity questions
  if (q.includes('equity') || q.includes('odds') || q.includes('percent')) {
    return `Equity just means: if we got all-in right now, how often do we win? It's your share of the pot mathematically.`;
  }

  // Position questions
  if (q.includes('position')) {
    return `Position = information. When you act last, you see what everyone else does first. That's power. Use it.`;
  }

  // General "help" or confusion
  if (q.includes('help') || q.includes('stuck') || q.includes('idk') || q.includes("don't know")) {
    return `${pick(COACH_VOICE.simpler)} What's your gut say? Trust it, then we'll talk about why.`;
  }

  return null; // No matching pattern, let the main handler deal with it
}
