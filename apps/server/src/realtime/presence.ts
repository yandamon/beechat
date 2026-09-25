export interface PresenceHooks {
  onOnline: (userId: number) => void | Promise<void>;
  onOffline: (userId: number) => void | Promise<void>;
}

/**
 * 在线状态：按用户计数连接数，全部断开后延迟 graceMs 再判定离线，
 * 刷新页面这类瞬断不会闪烁。目前状态在进程内存里，接口保持独立，
 * 以后多实例部署时换成 Redis 实现即可。
 */
export class PresenceService {
  private readonly connections = new Map<number, number>();
  private readonly offlineTimers = new Map<number, NodeJS.Timeout>();

  constructor(
    private readonly hooks: PresenceHooks,
    private readonly graceMs: number,
  ) {}

  /** 宽限期内仍视为在线 */
  isOnline(userId: number) {
    return (this.connections.get(userId) ?? 0) > 0 || this.offlineTimers.has(userId);
  }

  onlineAmong(userIds: Iterable<number>) {
    const online = new Set<number>();
    for (const userId of userIds) if (this.isOnline(userId)) online.add(userId);
    return online;
  }

  connect(userId: number) {
    const pending = this.offlineTimers.get(userId);
    if (pending) {
      clearTimeout(pending);
      this.offlineTimers.delete(userId);
    }
    const next = (this.connections.get(userId) ?? 0) + 1;
    this.connections.set(userId, next);
    // 宽限期内重连的用户在别人眼里一直在线，不用再广播
    if (next === 1 && !pending) void this.hooks.onOnline(userId);
  }

  disconnect(userId: number) {
    const next = (this.connections.get(userId) ?? 1) - 1;
    if (next > 0) {
      this.connections.set(userId, next);
      return;
    }
    this.connections.delete(userId);
    const timer = setTimeout(() => {
      this.offlineTimers.delete(userId);
      if (!this.connections.has(userId)) void this.hooks.onOffline(userId);
    }, this.graceMs);
    this.offlineTimers.set(userId, timer);
  }

  dispose() {
    for (const timer of this.offlineTimers.values()) clearTimeout(timer);
    this.offlineTimers.clear();
    this.connections.clear();
  }
}
