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
- `preflop-ranges.ts` - GTO opening/3bet ranges by position
- `player-types.ts` - Player profiles (TAG, LAG, NIT, FISH, MANIAC, etc.)

### Components (`/src/components/`)
- `Coach.tsx` - Conversational chat interface with free text input
- `LiveTable.tsx` - Visual poker table with player seats
- `PlayingCard.tsx` - Card display
- `Board.tsx` - Community cards display
- `RangeGrid.tsx` - 13x13 hand range selector
- `HandDisplay.tsx` - Hole cards display
- `CoachingFeedback.tsx` - Feedback panels

## Current Issues to Fix

### Critical Bugs in `/play`
1. **SB vs BB scenario is broken** - When user is in SB and folds to them, it says "Action on you" with Fold/Open but doesn't clarify the situation (completing vs raising vs BB)

2. **Bet sizing not shown** - When facing a raise, need to show:
   - Pot size
   - Bet to call
   - Effective stack
   - Clear description of action

3. **Scenario context is vague** - "Action on you" is not helpful. Need:
   - "Folded to you, 1.5bb in pot. Open or fold?"
   - "UTG raises to 3bb, you have X. Fold/Call/3-bet?"

4. **State management issues** - Phase transitions are buggy, buttons sometimes don't work or loop

### Logic Problems
1. SB position needs special handling (already has 0.5bb posted)
2. BB position needs special handling (already has 1bb posted, acts last preflop)
3. Need to track: who raised, raise size, pot size, effective stacks
4. Need clearer action options based on scenario type

## What the User Wants

### Core Philosophy
- **Don't spoon-feed answers** - Ask questions first, make user commit to reasoning
- **Human-like coach** - Short sentences, examples with every explanation, not AI slop
- **Pattern building** - After 1-2 weeks, user should internalize the thinking process
- **Real situations** - Uncomfortable decisions, different player types, varying positions

### Coach Should Teach
- Good equity vs bad equity (with examples)
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

## Next Steps

### Immediate Fix Needed
Rewrite `/src/app/play/page.tsx` with proper logic:

1. **Scenario Types**:
   - RFI (Raise First In) - folded to you
   - Facing Open - someone raised, you decide
   - Facing 3-bet - you opened, got 3-bet
   - Blind vs Blind - special handling

2. **Clear State**:
   ```typescript
   interface Scenario {
     type: 'rfi' | 'facing_open' | 'facing_3bet' | 'blind_battle';
     heroPosition: Position;
     heroHand: [Card, Card];
     heroStack: number;
     potSize: number;
     betToCall: number;  // 0 if RFI
     raiserPosition?: Position;
     raiserType?: PlayerType;
     raiseSize?: number;
   }
   ```

3. **Clear Prompts**:
   - RFI: "Folded to you in CO. Pot is 1.5bb. Do you open?"
   - Facing Open: "UTG (Nit) raises to 3bb. Pot is 4.5bb. You have AJo. Fold/Call/3-bet?"

4. **Proper Validation**:
   - Test each scenario type
   - Test each phase transition
   - Test button clicks don't loop
   - Test coach responses make sense

## File Structure
```
/poker-trainer
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing
│   │   ├── play/page.tsx         # Live table (NEEDS REWRITE)
│   │   ├── preflop/page.tsx
│   │   ├── hand-vs-range/page.tsx
│   │   └── board-reading/page.tsx
│   ├── components/
│   │   ├── Coach.tsx             # Chat interface
│   │   ├── LiveTable.tsx         # Table visual
│   │   └── ...
│   └── lib/
│       ├── deck.ts
│       ├── hand-evaluator.ts
│       ├── equity-calculator.ts
│       ├── preflop-ranges.ts
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
2. Rewrite `/src/app/play/page.tsx` with proper scenario logic
3. Test each flow manually
4. Ask "what's broken?" after each change and fix it
5. Deploy and verify
