import { useEffect } from 'react';

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
  jump: boolean;
  interact: boolean;
  enterVehicle: boolean;
  handbrake: boolean;
  aim: boolean;
  shoot: boolean;
  /** Accumulated mouse delta, drained every frame by the camera rig. */
  mouseDeltaX: number;
  mouseDeltaY: number;
  wheelDelta: number;
}

/**
 * A single mutable input snapshot. Gameplay reads this from inside the frame
 * loop, so it deliberately lives outside React state - no re-render per key.
 */
export const input: InputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  run: false,
  jump: false,
  interact: false,
  enterVehicle: false,
  handbrake: false,
  aim: false,
  shoot: false,
  mouseDeltaX: 0,
  mouseDeltaY: 0,
  wheelDelta: 0,
};

export type EdgeAction =
  | 'interact'
  | 'enterVehicle'
  | 'phone'
  | 'pause'
  | 'reload'
  | 'weapon';

type EdgeListener = (action: EdgeAction, payload?: number) => void;

const edgeListeners = new Set<EdgeListener>();

/** Subscribe to one-shot key presses that should not repeat while held. */
export function onEdge(listener: EdgeListener): () => void {
  edgeListeners.add(listener);
  return () => {
    edgeListeners.delete(listener);
  };
}

function emit(action: EdgeAction, payload?: number): void {
  for (const listener of edgeListeners) listener(action, payload);
}

const KEY_MAP: Record<string, keyof InputState> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  Space: 'jump',
};

export function resetInput(): void {
  input.forward = false;
  input.backward = false;
  input.left = false;
  input.right = false;
  input.run = false;
  input.jump = false;
  input.aim = false;
  input.shoot = false;
  input.handbrake = false;
  input.mouseDeltaX = 0;
  input.mouseDeltaY = 0;
  input.wheelDelta = 0;
}

/** Installs the global keyboard/mouse listeners for the whole session. */
export function useInput(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mapped = KEY_MAP[event.code];
      if (mapped) {
        if (event.repeat) return;
        (input[mapped] as boolean) = true;
        if (event.code === 'Space') {
          input.handbrake = true;
          event.preventDefault();
        }
        return;
      }
      if (event.repeat) return;
      switch (event.code) {
        case 'KeyE':
          input.interact = true;
          emit('interact');
          break;
        case 'KeyF':
          input.enterVehicle = true;
          emit('enterVehicle');
          break;
        case 'KeyR':
          emit('reload');
          break;
        case 'Tab':
          event.preventDefault();
          emit('phone');
          break;
        case 'Escape':
          emit('pause');
          break;
        case 'Digit1':
          emit('weapon', 1);
          break;
        case 'Digit2':
          emit('weapon', 2);
          break;
        case 'Digit3':
          emit('weapon', 3);
          break;
        default:
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const mapped = KEY_MAP[event.code];
      if (mapped) (input[mapped] as boolean) = false;
      if (event.code === 'Space') input.handbrake = false;
      if (event.code === 'KeyE') input.interact = false;
      if (event.code === 'KeyF') input.enterVehicle = false;
    };

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement) {
        input.mouseDeltaX += event.movementX;
        input.mouseDeltaY += event.movementY;
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 0) input.shoot = true;
      if (event.button === 2) input.aim = true;
    };

    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 0) input.shoot = false;
      if (event.button === 2) input.aim = false;
    };

    const onWheel = (event: WheelEvent) => {
      input.wheelDelta += event.deltaY;
    };

    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    const onBlur = () => resetInput();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}
