'use client';

import Link from 'next/link';

const drillModules = [
  {
    id: 'hand-vs-range',
    title: 'Equity Training',
    description: 'Guess your equity against ranges',
    icon: '🎯',
  },
  {
    id: 'preflop',
    title: 'Preflop Drills',
    description: 'Quick-fire opening decisions',
    icon: '📊',
  },
  {
    id: 'board-reading',
    title: 'Board Reading',
    description: 'Analyze textures and combos',
    icon: '🧠',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-green-900/30 to-blue-900/30" />
        <div className="relative max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            Poker Intuition Trainer
          </h1>
          <p className="text-xl text-gray-400 max-w-xl mx-auto mb-8">
            Stop memorizing. Start thinking. Build real poker instincts through guided practice.
          </p>
        </div>
      </div>

      {/* Main CTA - Live Table */}
      <div className="max-w-4xl mx-auto px-4 -mt-4">
        <Link
          href="/play"
          className="block group relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-800 to-green-900 border-2 border-green-600 hover:border-green-400 transition-all hover:scale-[1.01] shadow-2xl"
        >
          <div className="absolute inset-0 bg-[url('/felt-texture.png')] opacity-10" />
          <div className="relative p-8 sm:p-12">
            <div className="flex items-center gap-4 mb-4">
              <div className="text-5xl">🎰</div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold">Join a Table</h2>
                <p className="text-green-300">Interactive training with your coach</p>
              </div>
            </div>

            <p className="text-gray-300 mb-6 max-w-lg">
              Sit down at a live table. Your coach will challenge you to think through each decision -
              no spoon-feeding, just the questions that build real intuition.
            </p>

            <div className="flex flex-wrap gap-3 mb-6">
              {['Guided thinking', 'Real scenarios', 'Instant feedback', 'Pattern building'].map(tag => (
                <span key={tag} className="px-3 py-1 bg-green-700/50 rounded-full text-sm">
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-green-400 font-semibold group-hover:translate-x-2 transition-transform">
                Start Playing →
              </span>
              <span className="text-sm text-gray-400">Recommended</span>
            </div>
          </div>
        </Link>
      </div>

      {/* How it works */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-xl font-bold mb-8 text-center text-gray-400">How This Works</h2>

        <div className="grid sm:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-xl mx-auto mb-3">1</div>
            <h3 className="font-semibold mb-2">You get a situation</h3>
            <p className="text-sm text-gray-400">Position, stack sizes, opponent types - just like a real game</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-xl mx-auto mb-3">2</div>
            <h3 className="font-semibold mb-2">Coach asks questions</h3>
            <p className="text-sm text-gray-400">Before showing answers, you commit to your reasoning</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-xl mx-auto mb-3">3</div>
            <h3 className="font-semibold mb-2">You build patterns</h3>
            <p className="text-sm text-gray-400">Repetition + thinking = instincts that transfer to real games</p>
          </div>
        </div>
      </div>

      {/* Quick Drills */}
      <div className="bg-gray-900/50 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-lg font-bold mb-6 text-gray-400">Quick Drills</h2>

          <div className="grid sm:grid-cols-3 gap-4">
            {drillModules.map((module) => (
              <Link
                key={module.id}
                href={`/${module.id}`}
                className="p-4 bg-gray-800 hover:bg-gray-700 rounded-xl transition group"
              >
                <div className="text-2xl mb-2">{module.icon}</div>
                <h3 className="font-semibold mb-1">{module.title}</h3>
                <p className="text-sm text-gray-400">{module.description}</p>
                <span className="text-xs text-blue-400 mt-2 inline-block group-hover:translate-x-1 transition-transform">
                  Practice →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Philosophy */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="bg-gray-900 rounded-xl p-6 sm:p-8 border border-gray-800">
          <h2 className="text-lg font-bold mb-4">Why This Approach?</h2>
          <div className="space-y-4 text-gray-300">
            <p>
              <strong className="text-white">Most training tools give you answers.</strong> You memorize charts,
              run simulations, watch videos. Then you sit at a real table and freeze - because you never
              learned to <em>think</em>, you learned to remember.
            </p>
            <p>
              <strong className="text-white">This tool asks you questions.</strong> Before you see the "correct"
              play, you have to commit to your read. You have to articulate why. That mental effort is what
              builds real intuition.
            </p>
            <p>
              <strong className="text-white">After 1-2 weeks of this</strong>, you&apos;ll notice something:
              you&apos;re pattern-matching automatically. The coach&apos;s questions become your inner monologue.
              That&apos;s the goal.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>Poker Intuition Trainer</p>
          <p className="mt-1">No real money. Pure decision training.</p>
        </div>
      </footer>
    </div>
  );
}
