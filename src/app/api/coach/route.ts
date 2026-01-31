import { NextRequest, NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `You're a sharp poker coach watching a student play. Talk like a real person, not a textbook.

STYLE:
- SHORT answers. 2-4 sentences usually. No headers or bullet points unless doing math.
- Answer their ACTUAL question directly first, then add context if needed.
- When doing math, show the numbers simply: "9 outs × 2 = 18%"
- Be direct: "Bet. You have top pair, they probably missed."
- Sound human: "Look, they're a LAG - half their range is air here."

WHEN THEY ASK ABOUT PROBABILITIES/ODDS:
Just do the math conversationally:
- "Board has 2 spades. Flush draw needs 2 more spades. 9 outs left = 18% on river."
- "They're LAG, play 35% of hands. Maybe 1/4 of that is suited spades. So ~8% of their range has a flush draw."

PLAYER TYPES (use these to estimate ranges):
- LAG: 30-40% of hands, lots of suited stuff, bluffs often
- TAG: 15-20% of hands, mostly strong, rarely bluffs
- NIT: 10% of hands, only premiums - when they bet, believe them
- FISH: 50%+ of hands, calls everything, don't bluff them
- MANIAC: Bets with anything, let them bluff into you

KEY NUMBERS TO KNOW:
- Flush draw: 9 outs → 36% on flop (×4), 18% on turn (×2)
- OESD: 8 outs → 32% on flop, 16% on turn
- Gutshot: 4 outs → 16% on flop, 8% on turn
- Pot odds: call ÷ (pot + call). 1bb into 3bb = 25%

COMMON QUESTIONS:
- "Do they have X?" → Estimate based on player type and actions
- "What are my odds?" → Count outs, multiply by 4 or 2
- "Should I bet/call/fold?" → Quick recommendation with one reason
- "Why?" → Give the core logic in 1-2 sentences

DON'T:
- Use headers like "WHAT WE KNOW"
- Write essays
- Repeat information they already know
- Say "let me break this down" - just break it down

DO:
- Answer the question first
- Do quick math when relevant
- Give a clear recommendation
- Sound like a friend who's good at poker

CRITICAL - UNDERSTAND THE ACTION:
- "Checked to hero" = NO bet to call. Hero can CHECK (free) or BET. Cannot fold.
- "Facing Xbb to call" = There IS a bet. Hero can CALL, RAISE, or FOLD.
- NEVER say "fold" when it's checked to hero - that's not an option!

CRITICAL - UNDERSTAND HAND STRENGTH:
- If context says "hero doesn't connect" or "just board pair" = hero has NOTHING. Don't treat it as a real pair.
- "One Pair" on a paired board where hero doesn't connect = effectively HIGH CARD (very weak)
- Position matters: acting last (in position) is a big advantage
- Multiway pots: be more cautious, less bluffing`;

interface HandContext {
  heroCards: string;
  heroPosition: string;
  heroStack: number;
  board: string;
  pot: number;
  toCall: number;
  street: string;
  villainName?: string;
  villainPosition?: string;
  villainType?: string;
  villainStack?: number;
  heroMadeHand?: string;
  heroConnectsWithBoard?: boolean; // Does hero's hand actually connect, or just board pair?
  heroDraws?: string[];
  heroOuts?: number;
  actionHistory?: string[];
  playersInHand?: number;
  heroIsInPosition?: boolean;
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
    let contextMsg = `HAND STATE:\n`;
    contextMsg += `Street: ${handContext.street}\n`;
    contextMsg += `Hero: ${handContext.heroCards} in ${handContext.heroPosition} (${handContext.heroStack}bb stack)\n`;

    if (handContext.board && handContext.board.trim()) {
      contextMsg += `Board: ${handContext.board}\n`;

      // Be specific about hand strength
      if (handContext.heroConnectsWithBoard === false) {
        contextMsg += `Hero's hand: ${handContext.heroMadeHand} (BUT hero doesn't connect - just board pair, effectively air)\n`;
      } else {
        contextMsg += `Hero's hand: ${handContext.heroMadeHand}`;
        if (handContext.heroDraws && handContext.heroDraws.length > 0) {
          contextMsg += ` + ${handContext.heroDraws.join(', ')} (${handContext.heroOuts} outs)`;
        }
        contextMsg += `\n`;
      }
    } else {
      contextMsg += `Board: None yet (preflop)\n`;
    }

    // Pot and players
    contextMsg += `Pot: ${handContext.pot}bb\n`;
    if (handContext.playersInHand && handContext.playersInHand > 2) {
      contextMsg += `Players in hand: ${handContext.playersInHand} (MULTIWAY)\n`;
    }

    if (handContext.toCall > 0) {
      // Clarify if this is a real bet or just completing the blind
      const isJustBlind = handContext.street === 'preflop' && handContext.toCall <= 1;
      if (isJustBlind && handContext.heroPosition === 'SB') {
        contextMsg += `Action: Hero in SB can complete 0.5bb, raise, or fold\n`;
      } else {
        contextMsg += `Action: FACING A BET - ${handContext.toCall}bb to call. Options: CALL, RAISE, or FOLD\n`;
      }
      const potOdds = (handContext.toCall / (handContext.pot + handContext.toCall) * 100).toFixed(0);
      contextMsg += `Pot odds: ${potOdds}%\n`;
    } else {
      contextMsg += `Action: CHECKED TO HERO - no bet to call. Options: CHECK or BET (cannot fold)\n`;
    }

    if (handContext.villainName) {
      contextMsg += `\nVillain: ${handContext.villainName} (${handContext.villainPosition}, ${handContext.villainStack}bb) - ${handContext.villainType}\n`;
      contextMsg += `Position: ${handContext.heroIsInPosition ? 'Hero acts LAST (has position)' : 'Hero acts FIRST (out of position)'}\n`;
    }

    if (handContext.actionHistory && handContext.actionHistory.length > 0) {
      contextMsg += `\nAction so far: ${handContext.actionHistory.slice(-5).join('. ')}\n`;
    }

    contextMsg += `\n---\nStudent asks: "${question}"`;

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
