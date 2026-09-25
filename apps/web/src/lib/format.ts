const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dayFormat = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });
const fullFormat = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 会话列表里的时间：今天显示时刻，今年显示月日，更早显示年月日 */
export function formatListTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (startOfDay(date) === startOfDay(now)) return timeFormat.format(date);
  if (date.getFullYear() === now.getFullYear()) return dayFormat.format(date);
  return fullFormat.format(date);
}

/** 消息气泡旁的时间：今天只显示时刻，否则带上日期 */
export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = timeFormat.format(date);
  if (startOfDay(date) === startOfDay(now)) return time;
  if (date.getFullYear() === now.getFullYear()) return `${dayFormat.format(date)} ${time}`;
  return `${fullFormat.format(date)} ${time}`;
}
