import type { AttachmentView } from './chat';

/** 服务端签发的直传地址；本地驱动时指向本服务，R2 时指向对象存储 */
export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
}

/** 上传完成并确认后的结果，可直接用于发送图片消息或设置头像 */
export interface UploadedAttachment extends AttachmentView {
  key: string;
}
