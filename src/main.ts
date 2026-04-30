import { Game } from './Game';

let game: Game | null = null;

export function startXianxia(container: HTMLElement): void {
  game = new Game(container);

  const overlay = document.getElementById('game-overlay')!;
  const startBtn = document.getElementById('game-start') as HTMLButtonElement;

  overlay.style.display = 'flex';
  startBtn.textContent = '点击开始';

  startBtn.addEventListener('click', () => {
    overlay.style.display = 'none';
    game!.start();
  }, { once: true });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement == null && game) {
      overlay.style.display = 'flex';
      startBtn.textContent = '点击继续';
      startBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
        game!.start();
      }, { once: true });
    } else {
      overlay.style.display = 'none';
    }
  });
}

export function stopXianxia(): void {
  if (game) {
    game.dispose();
    game = null;
  }
}
