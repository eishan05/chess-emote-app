import { findBestMove, type Level } from './search';

interface Request {
  id: number;
  history: string[];
  level: Level;
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, history, level } = e.data;
  try {
    const result = findBestMove(history, level);
    postMessage({ id, result });
  } catch (err) {
    postMessage({ id, result: null, error: String(err) });
  }
};
