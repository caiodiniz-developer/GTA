import { useEffect, useRef } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useUiStore } from '../../stores/uiStore';
import { useVehicleStore } from '../../stores/vehicleStore';
import { gameRefs } from '../../game/gameRefs';
import { InteractionPrompt } from './InteractionPrompt';
import { Speedometer } from './Speedometer';
import { TutorialHints } from './TutorialHints';

/** On-foot pace readout; reads refs each frame rather than React state. */
function OnFootSpeed(): React.JSX.Element {
  const valueRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (valueRef.current) {
        const kmh = Math.round(gameRefs.currentSpeed * 3.6);
        valueRef.current.textContent = String(kmh).padStart(3, '0');
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="flex items-baseline gap-2 font-mono">
      <span ref={valueRef} className="text-2xl font-bold tabular-nums text-white">
        000
      </span>
      <span className="text-[10px] uppercase tracking-widest text-neutral-500">km/h</span>
    </div>
  );
}

export function HUD(): React.JSX.Element | null {
  const gameState = useGameStore((state) => state.state);
  const clock = useGameStore((state) => state.clock);
  const money = usePlayerStore((state) => state.money);
  const health = usePlayerStore((state) => state.health);
  const toast = useUiStore((state) => state.toast);
  const activeVehicleId = useVehicleStore((state) => state.activeVehicleId);
  const vehicles = useVehicleStore((state) => state.vehicles);

  if (gameState !== 'PLAYING') return null;

  const activeVehicle = activeVehicleId
    ? vehicles.find((vehicle) => vehicle.id === activeVehicleId)
    : undefined;

  const hours = Math.floor(clock);
  const minutes = Math.floor((clock - hours) * 60);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Top right: money and clock */}
      <div className="absolute right-6 top-5 text-right">
        <div className="font-mono text-2xl font-bold tracking-tight text-emerald-400">
          ${money.toLocaleString('en-US')}
        </div>
        <div className="mt-1 font-mono text-[11px] tracking-widest text-neutral-400">
          {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}
        </div>
      </div>

      {/* Bottom right: speed, swapping to the vehicle cluster while driving */}
      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-3">
        {activeVehicle ? <Speedometer kind={activeVehicle.kind} /> : <OnFootSpeed />}
        {!activeVehicle && (
          <div className="h-[3px] w-32 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-300"
              style={{ width: `${health}%` }}
            />
          </div>
        )}
      </div>

      {toast && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2">
          <div className="rounded-sm border border-white/10 bg-black/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-400 backdrop-blur-sm">
            {toast}
          </div>
        </div>
      )}

      <InteractionPrompt />
      {!activeVehicle && <TutorialHints />}
    </div>
  );
}
