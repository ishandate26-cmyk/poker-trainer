# Poker Intuition Trainer - Development Context

## Project Overview
A web app for practicing poker decision-making with incomplete information. The goal is to build real poker intuition through guided practice, not memorization.

**Live URL**: https://poker-trainer-zeta.vercel.app
**Tech Stack**: Next.js 14, TypeScript, Tailwind CSS, Vercel

## What's Been Built

### Pages
- `/` - Landing page with module links
- `/play` - **Main feature**: Live table training with conversational coach
- `/preflop` - Quick-fire preflop decision drills
- `/hand-vs-range` - Equity estimation practice
- `/board-reading` - Board texture quiz

### Core Libraries (`/src/lib/`)
- `deck.ts` - Card/deck utilities
- `hand-evaluator.ts` - Hand ranking logic
- `equity-calculator.ts` - Monte Carlo equity calculation
- `preflop-ranges.ts` - GTO opening/3bet/calling ranges by position
- `player-types.ts` - Player profiles (TAG, LAG, NIT, FISH, MANIAC, etc.)

### Components (`/src/components/`)
- `Coach.tsx` - Conversational chat interface with free text input + answerQuestion()
- `LiveTable.tsx` - Visual poker table with player seats
- `PlayingCard.tsx` - Card display
- `Board.tsx` - Community cards display
- `RangeGrid.tsx` - 13x13 hand range selector (supports highlighting)
- `HandDisplay.tsx` - Hole cards display
- `CoachingFeedback.tsx` - Feedback panels

## Recent Fixes (Jan 2026)

### Fixed Issues
1. **SB vs BB messaging** - Now says "Folded to you in the small blind. Just you and the big blind." with appropriate range questions (35%/50%/65%)

2. **Bet sizing shown** - When facing a raise, now shows:
   - Pot size
   - Bet to call (accounting for blinds already posted)
   - Clear description: "UTG raises to 3bb. Pot is 4.5bb. You need 3bb to call."

3. **Proper calling ranges** - Added CALLING_RANGES to preflop-ranges.ts (separate from OPENING_RANGES). Much more accurate for facing open scenarios.

4. **Range display for facing open** - "Show range" button now shows:
   - Green = 3-bet hands
   - Yellow = calling hands
   - Pink with ring = your hand

5. **Phase transitions** - Clean state machine with proper phase handling

### Scenario Types Implemented
- `rfi` - Raise First In (folded to you)
- `facing_open` - Someone raised, you decide (Fold/Call/3-bet)

### Scenario Interface
```typescript
interface Scenario {
  type: ScenarioType;
  heroPosition: Position;
  heroHand: [Card, Card];
  heroStack: number;
  potSize: number;
  betToCall: number;
  raiserPosition?: Position;
  raiserType?: PlayerType;
  raiserName?: string;
  raiseSize?: number;
  correctAction: ActionChoice;
}
```

## What the User Wants

### Core Philosophy
- **Don't spoon-feed answers** - Ask questions first, make user commit to reasoning
- **Human-like coach** - Short sentences, examples with every explanation, not AI slop
- **Pattern building** - After 1-2 weeks, user should internalize the thinking process
- **Real situations** - Uncomfortable decisions, different player types, varying positions

### Coach Teaches (with examples)
- Good equity vs bad equity
- Fold equity (when you have it, when you don't)
- Position (why it matters in different spots)
- Pot odds, implied odds
- Blockers, dominated hands
- Playability

### Free Text Questions Coach Handles
- "why?" / "why fold?" / "why raise?"
- "what's a range?" / "what do you mean by 23%?"
- "what's equity?" / "what's fold equity?"
- "explain simpler" / "I don't understand"
- "what if I was on the button?"
- "what's their range?"
- "what's good equity?" / "what's bad equity?"
- "what's playability?" / "what's dominated?"

## Potential Future Improvements

1. **BB vs SB limp** - When SB limps and hero is BB, option to check/raise
2. **Facing 3-bet** - Hero opens, gets 3-bet, decide fold/call/4-bet
3. **Post-flop scenarios** - Continuation betting, draws, etc.
4. **Statistics tracking** - Track correct/incorrect over time
5. **Adaptive difficulty** - Adjust based on performance

## File Structure
```
/poker-trainer
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing
│   │   ├── play/page.tsx         # Live table (REWRITTEN)
│   │   ├── preflop/page.tsx
│   │   ├── hand-vs-range/page.tsx
│   │   └── board-reading/page.tsx
│   ├── components/
│   │   ├── Coach.tsx             # Chat interface + answerQuestion
│   │   ├── LiveTable.tsx         # Table visual
│   │   ├── RangeGrid.tsx         # Range display with highlighting
│   │   └── ...
│   └── lib/
│       ├── deck.ts
│       ├── hand-evaluator.ts
│       ├── equity-calculator.ts
│       ├── preflop-ranges.ts     # OPENING, CALLING, 3BET ranges
│       └── player-types.ts
```

## Commands
```bash
npm run dev      # Local development
npm run build    # Build check
npx vercel --prod --yes  # Deploy to production
```

## Resume Instructions
1. Read this file
2. Check `/src/app/play/page.tsx` for current implementation
3. Test flows: RFI (various positions), facing open (various positions)
4. Test free text questions work
5. Ask "what's broken?" and iterate
