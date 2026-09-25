import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageDriver } from './types';

export interface R2Options {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** 直传地址有效期，够浏览器传完一张 5 MB 的图 */
const PRESIGN_TTL_SECONDS = 300;

/**
 * Cloudflare R2 驱动，走 S3 兼容接口。桶需要配置 CORS 允许站点来源的 PUT，
 * 并开启公开访问（r2.dev 域名或自定义域名）供读取。
 */
export class R2StorageDriver implements StorageDriver {
  readonly name = 'r2' as const;
  private readonly client: S3Client;

  constructor(private readonly options: R2Options) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async presignUpload(input: { key: string; mime: string; size: number }) {
    const command = new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: input.key,
      ContentType: input.mime,
      ContentLength: input.size,
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: PRESIGN_TTL_SECONDS });
    return { uploadUrl, method: 'PUT' as const, headers: { 'Content-Type': input.mime } };
  }

  async head(key: string) {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
      return { size: result.ContentLength ?? 0 };
    } catch (error) {
      if ((error as { name?: string }).name === 'NotFound') return null;
      throw error;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
  }
}
