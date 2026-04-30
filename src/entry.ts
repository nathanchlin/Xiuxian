import { Game } from './Game';

const container = document.getElementById('game')!;
const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;

const game = new Game(container);

startBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  game.start();
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement == null) {
    // Don't show start overlay when game is showing its own end screen
    if (game.state === 'dead' || game.state === 'game_over' || game.state === 'level_complete') {
      return;
    }
    overlay.style.display = 'flex';
    startBtn.textContent = '点击继续';
  } else {
    overlay.style.display = 'none';
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
