import { Server } from 'socket.io';
import type { App } from './app';

export function attachRealtime(app: App) {
  const io = new Server(app.server, { serveClient: false });

  io.on('connection', (socket) => {
    app.log.info({ socketId: socket.id }, 'socket connected');
    socket.on('disconnect', (reason) => {
      app.log.info({ socketId: socket.id, reason }, 'socket disconnected');
    });
  });

  app.addHook('onClose', async () => {
    await io.close();
  });

  return io;
}
