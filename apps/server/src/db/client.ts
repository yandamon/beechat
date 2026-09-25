import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzle({ client: pool, schema, casing: 'snake_case' });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];
/** 事务对象 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** 既能用连接池也能用事务的查询入口 */
export type DbLike = Db | Tx;

/** 应用 drizzle/ 目录下尚未执行的迁移。服务启动时调用，幂等。 */
export async function runMigrations(db: Db, migrationsFolder: string) {
  await migrate(db, { migrationsFolder });
}
