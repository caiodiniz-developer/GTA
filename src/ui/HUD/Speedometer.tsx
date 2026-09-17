import { useEffect, useRef } from 'react';
import { getVehicleDefinition, type VehicleKind } from '../../config/vehicles';
import { gameRefs } from '../../game/gameRefs';

interface SpeedometerProps {
  kind: VehicleKind;
}

/**
 * Vehicle speed readout.
 *
 * Speed changes every frame, so this writes straight into the DOM from a
 * requestAnimationFrame loop instead of going through React state.
 */
export function Speedometer({ kind }: SpeedometerProps): React.JSX.Element {
  const definition = getVehicleDefinition(kind);
  const valueRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const maxKmh = definition.maxSpeed * 3.6;
    const tick = () => {
      const kmh = gameRefs.vehicleSpeed * 3.6;
      if (valueRef.current) {
        valueRef.current.textContent = String(Math.round(kmh)).padStart(3, '0');
      }
      if (barRef.current) {
        barRef.current.style.width = `${Math.min(100, (kmh / maxKmh) * 100)}%`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [definition.maxSpeed]);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-400">
        {definition.name}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          ref={valueRef}
          className="font-mono text-5xl font-bold leading-none tabular-nums text-white"
        >
          000
        </span>
        <span className="text-[10px] uppercase tracking-[0.25em] text-neutral-500">km/h</span>
      </div>
      <div className="h-[3px] w-44 overflow-hidden rounded-full bg-white/12">
        <div ref={barRef} className="h-full w-0 rounded-full bg-amber-400" />
      </div>
    </div>
  );
}
