import './style.css';
import { BotGame, OnlineGame, type GameController } from './game';
import { play, unlockAudio } from './sound';
import { mountGame } from './ui/gameScreen';
import { getPlayerName, mountHome } from './ui/home';

const app = document.getElementById('app')!;
let cleanup: () => void = () => {};

document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

function goHome() {
  cleanup();
  history.replaceState(null, '', location.pathname);
  cleanup = mountHome(app, {
    onBot(persona, side, name) {
      const game = new BotGame(persona, name, side);
      startGame(game);
      play('start');
      game.start();
    },
    onCreate(side, name) {
      startGame(new OnlineGame(name, { create: side }));
    },
    onJoin(code, name) {
      startGame(new OnlineGame(name, { join: code }));
    },
  });
}

function startGame(game: GameController) {
  cleanup();
  cleanup = mountGame(app, game, { onExit: goHome });
}

const room = new URLSearchParams(location.search).get('room');
if (room && /^[A-Za-z0-9]{5}$/.test(room)) startGame(new OnlineGame(getPlayerName(), { join: room }));
else goHome();
