import { create } from 'zustand';
import { socket } from '@/lib/socket';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

interface ConnectionState {
  status: ConnectionStatus;
  /** 是否曾经连上过；首次连接前不显示“断线”提示 */
  everConnected: boolean;
}

export const useConnectionStore = create<ConnectionState>(() => ({
  status: 'offline',
  everConnected: false,
}));

socket.on('connect', () => useConnectionStore.setState({ status: 'online', everConnected: true }));
socket.on('disconnect', () => useConnectionStore.setState({ status: 'offline' }));
socket.io.on('reconnect_attempt', () => useConnectionStore.setState({ status: 'connecting' }));
socket.on('connect_error', (error) => {
  // 会话失效时服务端会拒绝握手，此时不再自动重连，等用户重新登录
  if (error.message === 'unauthorized') {
    socket.disconnect();
    useConnectionStore.setState({ status: 'offline' });
  }
});

export function connectSocket() {
  if (socket.connected) return;
  useConnectionStore.setState({ status: 'connecting' });
  socket.connect();
}

export function disconnectSocket() {
  socket.disconnect();
}
