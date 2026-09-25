import { mkdirSync } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StorageDriver } from './types';

/** key 只允许字母、数字、斜杠、点、横线、下划线，防止路径穿越 */
export const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,199}$/;

export function isSafeKey(key: string) {
  return SAFE_KEY.test(key) && !key.includes('..');
}

/**
 * 本地磁盘驱动：文件放在 uploadsDir 下，直传地址指向本服务的
 * PUT /api/uploads/local/:key，公开地址是 /uploads/:key。
 * 适合开发；线上磁盘是临时的，重启会丢。
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;

  constructor(readonly uploadsDir: string) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  private pathFor(key: string) {
    if (!isSafeKey(key)) throw new Error(`unsafe storage key: ${key}`);
    return path.join(this.uploadsDir, key);
  }

  async presignUpload(input: { key: string; mime: string }) {
    return {
      uploadUrl: `/api/uploads/local/${input.key}`,
      method: 'PUT' as const,
      headers: { 'Content-Type': input.mime },
    };
  }

  async write(key: string, bytes: Buffer) {
    const target = this.pathFor(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }

  async head(key: string) {
    try {
      const info = await stat(this.pathFor(key));
      return info.isFile() ? { size: info.size } : null;
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await rm(this.pathFor(key), { force: true });
  }
}
