'use client';

import { useState, useEffect, useRef } from 'react';

export interface CoachMessage {
  id: string;
  type: 'coach' | 'user' | 'thinking' | 'reveal';
  content: string;
  options?: string[];
  waitingForResponse?: boolean;
  isQuestion?: boolean;
}

interface CoachProps {
  messages: CoachMessage[];
  onResponse: (response: string) => void;
  isThinking?: boolean;
  coachName?: string;
}

export function Coach({ messages, onResponse, isThinking = false, coachName = 'Coach' }: CoachProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
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

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : message.type === 'thinking'
                  ? 'bg-yellow-900/30 border border-yellow-600 text-yellow-100 italic'
                  : message.type === 'reveal'
                  ? 'bg-green-900/30 border border-green-600 text-green-100'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              {message.type === 'coach' && (
                <div className="text-xs text-gray-400 mb-1 font-semibold">{coachName}</div>
              )}
              <div className="whitespace-pre-wrap">{message.content}</div>
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

      {/* Options */}
      {showOptions && (
        <div className="p-4 border-t border-gray-800">
          <div className="flex flex-wrap gap-2">
            {lastMessage.options!.map((option) => (
              <button
                key={option}
                onClick={() => {
                  setSelectedOption(option);
                  onResponse(option);
                }}
                disabled={selectedOption !== null}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  selectedOption === option
                    ? 'bg-blue-600 text-white'
                    : selectedOption !== null
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Coach personality and question templates
export const COACH_PROMPTS = {
  // Opening questions - get them thinking before revealing
  preflop: {
    position: (pos: string) => `You're in ${pos}. Before I show you your cards - what range should you be playing from here?`,
    openOrFold: (hand: string) => `You look down at ${hand}. Quick - gut feeling - is this an open, or are we folding?`,
    whyOpen: (hand: string, pos: string) => `You said open. Why is ${hand} playable from ${pos}? What makes this hand work?`,
    whyFold: (hand: string, pos: string) => `Folding ${hand} from ${pos}. Tell me - what would need to change for this to be an open?`,
    facingRaise: (raiserPos: string, raiserType: string) => `${raiserType} in ${raiserPos} opens. Before you look at your hand - what's their likely range?`,
    adjustVsPlayer: (playerType: string) => `You're up against a ${playerType}. How does this change your approach?`,
  },

  // Probing questions - make them commit to reasoning
  probing: {
    whatBeatsYou: () => `What hands in their range have you crushed? What hands crush you?`,
    boardTexture: () => `Look at this board. What draws are possible? Is this wet or dry?`,
    villainRange: () => `Put yourself in their shoes. What hands are they taking this line with?`,
    whatWouldYouDo: () => `If you were them with a bluff here, would you take this line?`,
    sizingTell: (size: string) => `They bet ${size}. What does this sizing usually mean?`,
  },

  // After decision - coaching moments
  feedback: {
    correct: [
      "That's the play. Now tell me - why is it correct?",
      "Right. But let's make sure you know why, not just what.",
      "Good. What would change your decision here?",
      "Correct. Against a different player type, would this change?",
    ],
    incorrect: [
      "Not quite. Before I explain - what was your reasoning?",
      "Let's work through this. What factors did you consider?",
      "Close, but there's something you're missing. What do you think it is?",
      "That's a common mistake. Why do you think players make this error?",
    ],
    pushBack: [
      "Are you sure? Think about it again.",
      "Interesting. But what about...",
      "That's one way to look at it. Consider this angle...",
      "Most players think that. The profitable players think differently.",
    ],
  },

  // Pattern recognition prompts
  patterns: {
    spotSimilar: () => `You've seen this spot before. What did we learn last time?`,
    applyLesson: (concept: string) => `Remember when we talked about ${concept}? How does it apply here?`,
    noticePattern: () => `There's a pattern here. Do you see it?`,
  },

  // Encouragement and pacing
  pacing: {
    slowDown: "Take your time. This is a decision that costs people money.",
    thinkOutLoud: "Walk me through your thought process.",
    noRush: "Real money on the line. What's the play?",
    commit: "Commit to your read. What's your action?",
  },
};

// Generate a random coach response from a category
export function getCoachPrompt(category: keyof typeof COACH_PROMPTS.feedback): string {
  const prompts = COACH_PROMPTS.feedback[category];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

// Simulate coach "typing" delay
export function useCoachTyping(baseDelay: number = 500) {
  const [isTyping, setIsTyping] = useState(false);

  const simulateTyping = async (callback: () => void, messageLength: number = 50) => {
    setIsTyping(true);
    // Longer messages = longer typing time, with some randomness
    const delay = baseDelay + Math.min(messageLength * 20, 2000) + Math.random() * 500;
    await new Promise(resolve => setTimeout(resolve, delay));
    setIsTyping(false);
    callback();
  };

  return { isTyping, simulateTyping };
}
