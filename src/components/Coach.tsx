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

// Answer common questions with human-like responses - ALWAYS with examples
export function answerQuestion(question: string, context: {
  hand?: string;
  position?: string;
  villainType?: string;
  action?: string;
}): string | null {
  const q = question.toLowerCase();

  // EQUITY - deep explanations
  if (q.includes('good equity') || q.includes('when is equity good') || q.includes('enough equity')) {
    return `Good equity = you win often enough to profit. Rule of thumb:

• 50%+ equity = strong, you want to get money in
• 40-50% = okay if you have position or implied odds
• 30-40% = need a good price (pot odds)
• <30% = usually fold unless amazing odds

Example: AKs vs a tight player's range (QQ+, AK) has ~40% equity. Sounds bad, but if they're folding half the time to your 3-bet, your TOTAL expectation (fold equity + showdown equity) is profitable.`;
  }

  if (q.includes('bad equity') || q.includes('not enough equity') || q.includes('equity too low')) {
    return `Bad equity = you're losing more than you win. Example:

K8o vs a TAG's opening range: you have ~35% equity. Sounds playable? But:
• You're out of position
• When you hit a K, they often have KQ, KJ, AK
• When you hit an 8, any overcard beats you

35% equity + bad position + dominated often = fold. You need ~40%+ AND good playability.`;
  }

  // FOLD EQUITY - deep explanations
  if (q.includes('fold equity') || q.includes('what is fold') || q.includes('when do they fold')) {
    return `Fold equity = the value you get when opponents fold. It's HUGE preflop.

Example: You 3-bet with A5s. Your actual hand equity vs their range might be 45%. But if they fold 50% of the time, you profit even when called.

When you have GOOD fold equity:
• You're repping a strong range
• Opponent is tight and folds a lot
• Stack sizes allow them to fold (not pot committed)

When you have BAD fold equity:
• Fish/calling stations (they never fold)
• You've been caught bluffing
• Opponent is pot committed

Against a nit: tons of fold equity. Against a fish: almost zero - just value bet.`;
  }

  if (q.includes('no fold equity') || q.includes('calling station') || q.includes('they never fold')) {
    return `When villain never folds (calling station/fish):

STOP BLUFFING. Seriously.

Instead:
• Value bet thinner - they'll call with worse
• Bet bigger for value - they don't notice sizing
• Check your medium hands - they'll bluff into you

Example: You have top pair weak kicker vs a fish. Normally you might check. Against a fish? Bet. They're calling with any pair, any draw, sometimes ace-high.`;
  }

  // POSITION - deep explanations
  if (q.includes('good position') || q.includes('why position') || q.includes('position matter')) {
    return `Position = acting last. Why it's huge:

1. INFORMATION: You see what they do first. They check? Maybe weak. They bet? Strong or bluffing - but you KNOW they did something.

2. POT CONTROL: In position, you can check behind and see free cards. Out of position, you check and they might bet, forcing tough decisions.

3. BLUFF EFFICIENCY: You can bet when they show weakness. Out of position, you're guessing.

Example: You have JTs.
• UTG (bad position): Fold or small open, pray
• BTN (good position): Raise, and if called you control the hand post-flop`;
  }

  if (q.includes('out of position') || q.includes('oop') || q.includes('bad position')) {
    return `Out of position (OOP) = acting first. It sucks because:

Example: You have AQ in the BB, call a BTN raise.

Flop: K72. What do you do?
• Bet? You might be bluffing into a K
• Check? They bet, now what? Call? Fold?

If YOU were on the button:
• They check, you bet and take it
• They bet, you can raise or call knowing they're committed

Same hand, but position makes AQ way more profitable on BTN vs BB.`;
  }

  // IMPLIED ODDS
  if (q.includes('implied odds') || q.includes('implied')) {
    return `Implied odds = money you'll win LATER if you hit.

Example: You have 55 facing a raise. Direct pot odds say fold - you only hit a set 12% of the time.

BUT if villain has a big stack and will pay you off when you hit:
• You invest 3bb now
• When you flop a set (1 in 8), you win 50bb+

That future money makes the call profitable. This is why you "set mine" with small pairs - bad immediate odds, great implied odds.

When implied odds are BAD:
• Short stacks (nothing left to win)
• Obvious draws (they won't pay when flush hits)
• Tight players (they fold when you hit)`;
  }

  // PLAYABILITY
  if (q.includes('playability') || q.includes('plays well') || q.includes('playable')) {
    return `Playability = how well a hand navigates post-flop.

HIGH playability:
• Suited connectors (76s) - makes straights, flushes, pairs
• Suited aces (A5s) - nut flush draws, wheel straights
• Big pairs (QQ+) - usually ahead on most flops

LOW playability:
• Offsuit junk (K4o) - makes weak pairs, no draws
• Dominating hands (AJ vs AK) - when you hit, you lose big

Example: K9s vs K9o from the CO.
• K9s: can make flushes, more confident with K-high flush draws
• K9o: just makes pairs, often dominated

Both are "playable" from CO, but K9s makes more money long-term.`;
  }

  // DOMINATED
  if (q.includes('dominated') || q.includes('dominate')) {
    return `Dominated = your hand shares a card with villain's better hand.

Example: You have KJ, villain has KQ.
• Flop comes K85
• You both have a pair of kings
• But their Q kicker beats your J
• You're "dominated" - usually losing a big pot

Most dangerous spots:
• AJ vs AK (you have 25% equity!)
• KT vs KQ
• A9 vs AT

This is why we fold hands like KTo, QJo from early position - they're often dominated when called.`;
  }

  // BLOCKERS
  if (q.includes('blocker') || q.includes('block')) {
    return `Blockers = cards that reduce villain's combos of certain hands.

Example: You have A♠5♠ on K♠T♠3♦.
• You block the nut flush (A♠ can't be in their hand)
• Good for bluffing - they can't have the nuts
• Bad for value - you want them to have the hand you block

When to use blockers:
• Bluffing: hold blockers to hands that would call
• Value betting: DON'T hold blockers to hands you want them to have

Example bluff: You have A♦K♦ on a missed board. You block AK, AA, KK - hands that would have you crushed. Good spot to bluff.`;
  }

  // POT ODDS
  if (q.includes('pot odds') || q.includes('odds to call')) {
    return `Pot odds = price you're getting to call.

Formula: Call amount / (Pot + Call amount)

Example: Pot is 10bb, villain bets 5bb. You need to call 5bb to win 15bb.
• Pot odds: 5/(15+5) = 25%
• You need 25% equity to break even on a call

If you have a flush draw (35% to hit): CALL - you have more equity than you need.
If you have a gutshot (8% to hit): FOLD - not enough equity.

Quick guide:
• Half pot bet = need 25% equity
• Full pot bet = need 33% equity
• 2x pot bet = need 40% equity`;
  }

  // Questions about percentages
  if (q.includes('%') || q.includes('percent') || q.includes('23') || q.includes('15') || q.includes('20')) {
    return `The percentage = how many of the 169 possible starting hands you play. Example: 23% means you play roughly 1 in 4 hands. So AA, KK, QQ, JJ, AK, AQ, suited connectors like JTs, 98s... that adds up to about 23%. Tight is ~15%, wide is ~40%.`;
  }

  // What is a range / what do you mean by range
  if (q.includes('range') || q.includes('what hands')) {
    return `A range = all the hands someone could have. Example: if I open from UTG, my range might be AA, KK, QQ, JJ, TT, AK, AQ. That's like 8% of hands. If I'm on the button, I add hands like K9s, Q8s, 65s - now it's 35%. The range chart shows which hands are "in" for each position.`;
  }

  // What is position
  if (q.includes('position')) {
    return `Position = where you sit relative to the dealer. Example: you have AJ. From UTG (first to act), it's borderline - fold or small open. From the Button (last to act), it's a clear raise. Why? On the button, you see everyone act first. Information = power.`;
  }

  // What is equity
  if (q.includes('equity')) {
    return `Equity = your chance to win. Example: you have AA vs KK. Your equity is ~82% - you win 82 times out of 100. Against a random hand, AA has 85% equity. Against a range of TT+, AK, it's more like 65%. The hand vs range trainer helps you estimate this.`;
  }

  // "Why" questions
  if (q.includes('why')) {
    if (q.includes('fold')) {
      return `Example: you have K8o in UTG. Looks okay right? But there's 5-8 players behind you. Someone probably has AK, KQ, or a pocket pair that dominates you. Long term, K8o loses money from early position. Fold, wait for a better spot.`;
    }
    if (q.includes('raise') || q.includes('open')) {
      return `Example: you have A5s on the button. It can make the nut flush, nut straight, or win with ace-high. Plus if everyone folds, you take the blinds. Playability + fold equity = open it up.`;
    }
    if (q.includes('call')) {
      return `Example: you have 77 facing a raise. Not strong enough to 3-bet, but if you hit a set (7 on the flop), you can win a big pot. You're "set mining" - calling to see if you hit.`;
    }
    if (q.includes('3bet') || q.includes('3-bet')) {
      return `Example: you have AKs vs a CO open. If you just call, you let them see a cheap flop. 3-bet: they either fold (you win) or call with worse hands (KQ, JJ, AQ). Either way, you profit.`;
    }
  }

  // "What if" questions
  if (q.includes('what if')) {
    if (q.includes('button') || q.includes('btn')) {
      return `On the button you can play ~40% of hands. Example: K7s is a fold from UTG, but an open from BTN. Why? You act last on every street - you see what everyone does before you decide.`;
    }
    if (q.includes('utg')) {
      return `UTG you play ~15% - only strong hands. Example: AJo is a fold from UTG but an open from CO. Too many players behind who could have you crushed.`;
    }
    if (q.includes('tight') || q.includes('nit')) {
      return `Against a nit: when they raise, they have it. Example: nit 3-bets you? They have QQ+ or AK, period. Don't call with JJ hoping to outplay them. Just fold unless you have AA/KK.`;
    }
    if (q.includes('loose') || q.includes('fish') || q.includes('maniac')) {
      return `Against a fish/maniac: don't bluff, just value bet. Example: you have top pair, they keep calling? Bet again. And again. They'll pay you off with second pair or worse.`;
    }
  }

  // Asking for simpler explanation or doesn't understand
  if (q.includes('simpler') || q.includes('eli5') || q.includes("don't understand") || q.includes('confused') || q.includes('explain') || q.includes('mean')) {
    if (context.action === 'fold') {
      return `Simple: ${context.hand || 'this hand'} from ${context.position || 'here'} loses money over time. Example: playing 72o from any position - you'll win sometimes, but lose more than you win. Fold and wait.`;
    }
    if (context.action === 'open') {
      return `Simple: ${context.hand || 'this hand'} from ${context.position || 'here'} makes money over time. Example: ATs from CO - you can make flushes, straights, and even ace-high wins sometimes. Raise it.`;
    }
    if (context.action === '3bet') {
      return `Simple: re-raise because you're ahead of their range. Example: they open KQo, you have AK. You're crushing them. Make them pay.`;
    }
    return `Okay, simpler: I'm asking what hands you'd play from this seat. Example: from UTG, only play premium stuff - AA, KK, AK. From the button, play way more - any pair, suited aces, connected cards.`;
  }

  // What does "opening" mean
  if (q.includes('open')) {
    return `Opening = being the first to raise preflop. Example: everyone folds to you, you raise to 2.5bb with AQs - you just "opened." If someone raised before you, you're not opening, you're facing an open.`;
  }

  // What is 3bet
  if (q.includes('3bet') || q.includes('3-bet') || q.includes('three bet')) {
    return `3-bet = re-raising someone's raise. Example: UTG raises to 3bb, you make it 9bb - that's a 3-bet. It says "I have a strong hand" (or you're bluffing). The original raise is the "2-bet" (blinds were the 1-bet).`;
  }

  // General "help" or confusion
  if (q.includes('help') || q.includes('stuck') || q.includes('idk') || q.includes("don't know")) {
    return `No worries. Quick rule: from early position (UTG, HJ), play tight - pairs 77+, broadway like AQ+, AK. From late position (CO, BTN), add suited connectors, suited aces, smaller pairs. What's your gut on this hand?`;
  }

  // Catch-all for questions we don't understand
  if (q.includes('?') || q.includes('what') || q.includes('how') || q.includes('mean')) {
    return `Good question. Let me put it simply: we're practicing which hands to play from which position. The chart shows green = play, empty = fold. The % is how many total hands that is. Example: 20% means you play the best 1 in 5 hands. Make sense?`;
  }

  return null;
}
