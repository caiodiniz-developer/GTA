import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useSettingsStore } from '../../stores/settingsStore';

const HINTS: [string, string][] = [
  ['WASD', 'Move'],
  ['SHIFT', 'Run'],
  ['SPACE', 'Jump'],
  ['MOUSE', 'Look'],
  ['ESC', 'Menu'],
];

/** Onboarding strip that fades itself out once the player is moving. */
export function TutorialHints(): React.JSX.Element | null {
  const showTutorial = useSettingsStore((state) => state.showTutorial);
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(showTutorial);

  useEffect(() => {
    if (!visible || !rootRef.current) return;
    const element = rootRef.current;
    gsap.fromTo(
      element.children,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.07, delay: 0.4, ease: 'power2.out' },
    );
    const timer = window.setTimeout(() => {
      gsap.to(element, {
        opacity: 0,
        duration: 0.8,
        onComplete: () => setVisible(false),
      });
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute bottom-8 left-1/2 flex -translate-x-1/2 gap-2"
    >
      {HINTS.map(([key, label]) => (
        <div
          key={key}
          className="flex items-center gap-2 rounded-sm border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-sm"
        >
          <kbd className="font-mono text-[11px] font-bold tracking-wider text-amber-400">
            {key}
          </kbd>
          <span className="text-[11px] uppercase tracking-wider text-neutral-300">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
