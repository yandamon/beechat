import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { config } from './config';
import { createDb, runMigrations } from './db/client';
import { attachRealtime } from './realtime';

// src/index.ts 与 dist/index.js 都在 apps/server 下一层，迁移目录固定为 ../drizzle
const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

const { db, pool } = createDb(config.DATABASE_URL);
await runMigrations(db, MIGRATIONS_DIR);

const app = await buildApp({ db });
app.addHook('onClose', async () => {
  await pool.end();
});
await app.ready();
attachRealtime(app);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ port: config.PORT, host: config.HOST });
