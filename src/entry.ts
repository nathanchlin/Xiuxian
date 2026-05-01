import { Game } from './Game';
import { Input } from './shared/Input';
import { TouchControls } from './ui/TouchControls';

const container = document.getElementById('game')!;
const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;

const game = new Game(container);
const isMobile = Input.isTouchDevice();

startBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  game.start();

  if (isMobile) {
    const tc = new TouchControls(game.input);
    game.input.setTouchControls(tc);
  }
});

if (!isMobile) {
  // Desktop: pointer-lock based pause/resume
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement == null) {
      if (game.state === 'dead' || game.state === 'game_over' || game.state === 'level_complete') {
        return;
      }
      overlay.style.display = 'flex';
      startBtn.textContent = '点击继续';
    } else {
      overlay.style.display = 'none';
    }
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
