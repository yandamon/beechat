import { buildApp } from './app';
import { config } from './config';
import { attachRealtime } from './realtime';

const app = await buildApp();
await app.ready();
attachRealtime(app);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ port: config.PORT, host: config.HOST });
