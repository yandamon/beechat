/**
 * 复制文字到剪贴板，返回是否成功。
 * Clipboard API 只在 https 和 localhost 下可用；用局域网 IP 调试时会失败，调用方提示用户手动复制。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!window.isSecureContext) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
