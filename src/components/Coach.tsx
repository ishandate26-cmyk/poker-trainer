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
  ],

  // Encouragement (not over the top)
  good: [
    "There you go.",
    "Now you're thinking.",
    "Exactly.",
    "That's it.",
    "Yep.",
    "Good.",
  ],

  // Gentle correction
  notQuite: [
    "Not quite.",
    "Close, but...",
    "Eh, not really.",
    "Sort of, but...",
  ],
};

// Get random from array
export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
