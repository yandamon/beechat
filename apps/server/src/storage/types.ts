/** 对象存储驱动：本地磁盘和 Cloudflare R2 各实现一份，业务代码只认这个接口 */
export interface StorageDriver {
  readonly name: 'local' | 'r2';
  /** 生成直传地址；浏览器用它 PUT 文件字节，服务器不经手 */
  presignUpload(input: { key: string; mime: string; size: number }): Promise<{
    uploadUrl: string;
    method: 'PUT';
    headers: Record<string, string>;
  }>;
  /** 上传完成后确认对象存在，返回实际大小；不存在返回 null */
  head(key: string): Promise<{ size: number } | null>;
  /** 删除对象，用于清理未完成或被替换的上传 */
  delete(key: string): Promise<void>;
}
