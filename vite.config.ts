import { defineConfig, type Plugin } from 'vite';
// @ts-ignore -- plain JS module without type declarations
import { attachRooms } from './server/rooms.js';

/** Runs the online-room WebSocket server inside Vite's dev/preview server, so `npm run dev` is all you need. */
function rooms(): Plugin {
  return {
    name: 'checkmoji-rooms',
    configureServer(server) {
      if (server.httpServer) attachRooms(server.httpServer);
    },
    configurePreviewServer(server) {
      attachRooms(server.httpServer);
    },
  };
}

export default defineConfig({
  plugins: [rooms()],
  server: { host: true },
  preview: { host: true },
  worker: { format: 'es' },
});
