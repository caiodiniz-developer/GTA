import { useUiStore } from '../../stores/uiStore';

/** Contextual "[ F ] ENTER HATCH" hint shown near the centre of the screen. */
export function InteractionPrompt(): React.JSX.Element | null {
  const prompt = useUiStore((state) => state.prompt);
  if (!prompt) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-[58%] -translate-x-1/2">
      <div className="flex items-center gap-2.5 rounded-sm border border-white/15 bg-black/65 px-3.5 py-2 backdrop-blur-sm">
        <kbd className="rounded-[3px] border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 font-mono text-xs font-bold text-amber-400">
          {prompt.key}
        </kbd>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-100">
          {prompt.label}
        </span>
      </div>
    </div>
  );
}
