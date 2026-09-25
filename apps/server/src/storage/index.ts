import path from 'node:path';
import { config } from '../config';
import { LocalStorageDriver } from './local';
import { R2StorageDriver } from './r2';
import type { StorageDriver } from './types';

export function createStorage(): StorageDriver {
  if (config.STORAGE_DRIVER === 'r2') {
    return new R2StorageDriver({
      accountId: config.R2_ACCOUNT_ID ?? '',
      accessKeyId: config.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: config.R2_SECRET_ACCESS_KEY ?? '',
      bucket: config.R2_BUCKET ?? '',
    });
  }
  return new LocalStorageDriver(path.resolve(config.UPLOADS_DIR));
}

/** 对象的公开访问地址；只依赖配置，任何地方都能算，不需要驱动实例 */
export function publicUrlFor(key: string): string {
  if (config.STORAGE_DRIVER === 'r2') return `${config.R2_PUBLIC_URL}/${key}`;
  return `/uploads/${key}`;
}

export type { StorageDriver } from './types';
