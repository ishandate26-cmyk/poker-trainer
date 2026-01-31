import { NextRequest, NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `You are a poker coach teaching a student to THINK through hands, not just giving answers.

YOUR JOB: Break down what we KNOW, what we DON'T know, and what we can INFER. Teach the framework.

CRITICAL RULES:
1. NEVER make up information. If something isn't in the context, say "I don't have that info"
2. Be ACCURATE with math. Double-check calculations.
3. PREFLOP vs POSTFLOP are different:
   - PREFLOP: We estimate equity based on hand strength vs villain's likely range
   - POSTFLOP: We can count outs and use Rule of 4/2
4. The Rule of 4/2 is ONLY for postflop with draws. NOT preflop.
5. Posting a blind is NOT a bet. If villain is BB and just posted, they haven't "bet"

FRAMEWORK FOR EVERY ANSWER:
1. WHAT WE KNOW: State the facts from the hand
2. WHAT WE DON'T KNOW: Villain's actual cards
3. WHAT WE CAN INFER: Based on their player type and actions
4. THE MATH: If relevant, show the calculation step by step
5. RECOMMENDATION: What to do and why

PLAYER TYPES:
- TAG: Tight range (top 15-20%), aggressive. When they bet, respect it.
- LAG: Wide range (30-40%), aggressive. Could be bluffing.
- NIT: Very tight (top 10%). Only premiums. Fold to their aggression.
- FISH: Plays too many hands, calls too much. Value bet them, don't bluff.
- CALLING STATION: Never folds. Just bet for value.
- MANIAC: Bets everything. Let them hang themselves.

PREFLOP EQUITY (rough estimates):
- Premium pairs (AA-QQ): 80% vs random, 55-65% vs tight range
- Big pairs (JJ-99): 70% vs random, 45-55% vs tight range
- AK: 65% vs random, 40-50% vs tight range
- Medium suited connectors: 45-50% vs random
- Weak offsuit (K4o, Q3o): 35-40% vs random, often dominated

POSTFLOP OUTS:
- Flush draw: 9 outs
- Open-ended straight draw: 8 outs
- Gutshot: 4 outs
- Two overcards: 6 outs
- One overcard: 3 outs
- Rule of 4: outs × 4 on FLOP (2 cards to come)
- Rule of 2: outs × 2 on TURN (1 card to come)

POT ODDS FORMULA:
- Pot odds % = amount to call ÷ (pot + amount to call)
- Example: 1bb to call into 3bb pot = 1/(3+1) = 25%

BE CONCISE but ACCURATE. Show your work on math.`;

interface HandContext {
  heroCards: string;
  heroPosition: string;
  board: string;
  pot: number;
  toCall: number;
  street: string;
  villainName?: string;
  villainPosition?: string;
  villainType?: string;
  heroMadeHand?: string;
  heroDraws?: string[];
  heroOuts?: number;
  actionHistory?: string[];
}

export async function POST(request: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OpenAI API key not configured' },
      { status: 500 }
    );
  }

  try {
    const { question, handContext } = await request.json() as {
      question: string;
      handContext: HandContext
    };

    // Build context message - be precise about what happened
    let contextMsg = `CURRENT HAND STATE:\n`;
    contextMsg += `Street: ${handContext.street}\n`;
    contextMsg += `Hero: ${handContext.heroCards} in ${handContext.heroPosition}\n`;

    if (handContext.board && handContext.board.trim()) {
      contextMsg += `Board: ${handContext.board}\n`;
      contextMsg += `Hero's hand: ${handContext.heroMadeHand}`;
      if (handContext.heroDraws && handContext.heroDraws.length > 0) {
        contextMsg += ` + ${handContext.heroDraws.join(', ')} (${handContext.heroOuts} outs)`;
      }
      contextMsg += `\n`;
    } else {
      contextMsg += `Board: None yet (preflop)\n`;
    }

    contextMsg += `Pot: ${handContext.pot}bb\n`;

    if (handContext.toCall > 0) {
      // Clarify if this is a real bet or just completing the blind
      const isJustBlind = handContext.street === 'preflop' && handContext.toCall <= 1;
      if (isJustBlind && handContext.heroPosition === 'SB') {
        contextMsg += `Action: Hero in SB needs to complete 0.5bb more to see flop (BB has just posted, not raised)\n`;
      } else {
        contextMsg += `Facing: ${handContext.toCall}bb to call\n`;
      }
      const potOdds = (handContext.toCall / (handContext.pot + handContext.toCall) * 100).toFixed(0);
      contextMsg += `Pot odds: ${potOdds}%\n`;
    } else {
      contextMsg += `Action: Checked to hero\n`;
    }

    if (handContext.villainName) {
      contextMsg += `\nMain villain: ${handContext.villainName} (${handContext.villainPosition}) - ${handContext.villainType}\n`;
    }

    if (handContext.actionHistory && handContext.actionHistory.length > 0) {
      contextMsg += `\nAction so far: ${handContext.actionHistory.slice(-5).join('. ')}\n`;
    }

    contextMsg += `\n---\nStudent's question: "${question}"\n\nRemember: Break down what we KNOW, what we can INFER, show math if asked. Be accurate.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contextMsg },
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      return NextResponse.json(
        { error: 'Failed to get response from AI' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const answer = data.choices[0]?.message?.content || 'Sorry, I couldn\'t generate a response.';

    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Coach API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
