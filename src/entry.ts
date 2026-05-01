import { Game } from './Game';
import { Input } from './shared/Input';
import { TouchControls } from './ui/TouchControls';

const container = document.getElementById('game')!;
const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;

const game = new Game(container);
const isMobile = Input.isTouchDevice();

let started = false;
startBtn.addEventListener('click', () => {
  overlay.style.display = 'none';

  if (!started) {
    started = true;
    game.start();
    if (isMobile) {
      const tc = new TouchControls(game.input);
      tc.onBagPress = () => game.toggleInventoryPanel();
      game.input.setTouchControls(tc);
    }
  } else {
    // Resume from ESC / tab-hide pause
    game.resume();
    game.input.requestPointerLock();
  }
});

if (!isMobile) {
  // Desktop: pointer-lock based pause/resume
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement == null) {
      if (game.state === 'dead' || game.state === 'dying' || game.state === 'game_over' || game.state === 'level_complete' || game.state === 'paused') {
        return;
      }
      overlay.style.display = 'flex';
      startBtn.textContent = '点击继续';
    } else {
      overlay.style.display = 'none';
    }
  });

  // Handle pointer lock rejection (e.g. after closing inventory panel)
  document.addEventListener('pointerlockerror', () => {
    if (game.state !== 'paused' && game.state !== 'dead' && game.state !== 'dying' && game.state !== 'game_over' && game.state !== 'level_complete' && game.state !== 'menu') {
      overlay.style.display = 'flex';
      startBtn.textContent = '点击继续';
    }
  });

  // Fallback: Game detects when pointer lock fails silently after inventory close
  game.onNeedOverlay = () => {
    overlay.style.display = 'flex';
    startBtn.textContent = '点击继续';
  };
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
