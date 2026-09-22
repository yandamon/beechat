import { create } from 'zustand';
import { socket } from '@/lib/socket';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

interface ConnectionState {
  status: ConnectionStatus;
}

export const useConnectionStore = create<ConnectionState>(() => ({ status: 'offline' }));

socket.on('connect', () => useConnectionStore.setState({ status: 'online' }));
socket.on('disconnect', () => useConnectionStore.setState({ status: 'offline' }));
socket.io.on('reconnect_attempt', () => useConnectionStore.setState({ status: 'connecting' }));

export function connectSocket() {
  useConnectionStore.setState({ status: 'connecting' });
  socket.connect();
}

export function disconnectSocket() {
  socket.disconnect();
}
