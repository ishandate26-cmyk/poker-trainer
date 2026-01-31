import { NextRequest, NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `You are a poker coach helping a student learn Texas Hold'em cash game strategy. You're watching them play a hand and answering their questions.

STYLE:
- Be concise - 2-4 sentences max unless they ask for detail
- Be direct - tell them what to do and why
- Use poker terms but explain if asked
- Give specific advice for THIS hand, not generic theory
- If they're making a mistake, tell them directly

PLAYER TYPES (when mentioned):
- TAG (Tight-Aggressive): Plays few hands but bets them hard. Usually has it when betting.
- LAG (Loose-Aggressive): Plays many hands aggressively. Bluffs often.
- NIT: Extremely tight. Only plays premium hands. When they bet, they have it.
- FISH: Loose-passive. Calls too much, rarely bluffs. Don't bluff them - value bet.
- CALLING STATION: Never folds. Just value bet relentlessly.
- MANIAC: Bets and raises constantly. Let them bluff into you.

CONCEPTS TO EXPLAIN SIMPLY WHEN ASKED:
- Pot odds: What % of the pot you're putting in vs what you win
- Equity: Your % chance to win the hand
- Outs: Cards that improve your hand (flush draw = 9 outs, OESD = 8, gutshot = 4)
- Rule of 4/2: Multiply outs by 4 on flop (2 cards coming) or 2 on turn (1 card)
- Position: Acting last is huge advantage - you see what they do first
- Fold equity: Chance they fold when you bet
- Implied odds: Extra money you win when you hit

When they ask what to do, consider:
1. Their hand strength
2. The board texture
3. Villain's player type
4. Pot odds if facing a bet
5. Position`;

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

    // Build context message
    let contextMsg = `CURRENT HAND:\n`;
    contextMsg += `Hero: ${handContext.heroCards} in ${handContext.heroPosition}\n`;

    if (handContext.board) {
      contextMsg += `Board: ${handContext.board} (${handContext.street})\n`;
      contextMsg += `Hero has: ${handContext.heroMadeHand}`;
      if (handContext.heroDraws && handContext.heroDraws.length > 0) {
        contextMsg += ` + ${handContext.heroDraws.join(', ')} (${handContext.heroOuts} outs)`;
      }
      contextMsg += `\n`;
    }

    contextMsg += `Pot: ${handContext.pot}bb\n`;

    if (handContext.toCall > 0) {
      contextMsg += `Facing bet: ${handContext.toCall}bb to call\n`;
      const potOdds = (handContext.toCall / (handContext.pot + handContext.toCall) * 100).toFixed(0);
      contextMsg += `Pot odds: ${potOdds}%\n`;
    }

    if (handContext.villainName) {
      contextMsg += `\nVillain: ${handContext.villainName} (${handContext.villainPosition}) - ${handContext.villainType}\n`;
    }

    if (handContext.actionHistory && handContext.actionHistory.length > 0) {
      contextMsg += `\nAction: ${handContext.actionHistory.slice(-3).join(', ')}\n`;
    }

    contextMsg += `\nStudent asks: "${question}"`;

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
