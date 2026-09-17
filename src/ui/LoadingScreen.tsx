import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useProgress } from '@react-three/drei';
import { useGameStore } from '../stores/gameStore';

/**
 * Covers the canvas until every GLB is decoded, then invites the player in.
 * drei's useProgress reports real loader progress, so the bar is honest.
 */
export function LoadingScreen(): React.JSX.Element {
  const { progress, active, item } = useProgress();
  const assetsReady = useGameStore((state) => state.assetsReady);
  const setAssetsReady = useGameStore((state) => state.setAssetsReady);
  const setState = useGameStore((state) => state.setState);

  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (barRef.current) {
      gsap.to(barRef.current, { width: `${progress}%`, duration: 0.45, ease: 'power2.out' });
    }
    // drei briefly reports 100% between files, so require a quiet frame too.
    if (progress >= 100 && !active && !settled.current) {
      settled.current = true;
      window.setTimeout(() => setAssetsReady(true), 350);
    }
  }, [progress, active, setAssetsReady]);

  const enter = () => {
    const root = rootRef.current;
    if (!root) return;
    gsap.to(root, {
      opacity: 0,
      duration: 0.7,
      ease: 'power2.inOut',
      onComplete: () => setState('PLAYING'),
    });
  };

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950"
    >
      <div className="w-full max-w-lg px-8">
        <h1 className="text-6xl font-black tracking-tighter text-white">
          CITY<span className="text-amber-400">RUSH</span>
        </h1>
        <p className="mt-2 text-xs font-medium uppercase tracking-[0.35em] text-neutral-500">
          The city never stops
        </p>

        <div className="mt-12 h-[3px] w-full overflow-hidden rounded-full bg-neutral-800">
          <div ref={barRef} className="h-full w-0 rounded-full bg-amber-400" />
        </div>

        <div className="mt-3 flex items-baseline justify-between font-mono text-xs text-neutral-500">
          <span className="truncate pr-4">
            {assetsReady ? 'CITY READY' : `LOADING ${shortName(item)}`}
          </span>
          <span className="tabular-nums text-neutral-300">
            {Math.round(progress)}%
          </span>
        </div>

        <button
          type="button"
          onClick={enter}
          disabled={!assetsReady}
          className="mt-10 w-full rounded-sm bg-amber-400 py-4 text-sm font-bold uppercase tracking-[0.25em] text-neutral-950 transition enabled:hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
        >
          {assetsReady ? 'Enter City' : 'Streaming assets'}
        </button>
      </div>
    </div>
  );
}

function shortName(item: string): string {
  if (!item) return 'CITY';
  const file = item.split('/').pop() ?? item;
  return file.replace('.glb', '').toUpperCase();
}
