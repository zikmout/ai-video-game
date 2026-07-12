import './ui/ui.css';
import { Game } from './Game';

/**
 * Application entry point. Boots the game into #app and keeps a reference for
 * Vite HMR so hot reloads dispose the previous instance cleanly.
 */
const root = document.getElementById('app');
if (!root) throw new Error('#app root element not found');

const game = new Game(root);

// Clean teardown on hot reload during development.
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
