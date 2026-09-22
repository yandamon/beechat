import { io } from 'socket.io-client';

// 同源连接：开发时由 Vite 代理到后端，生产环境由同一个服务提供。
export const socket = io({ autoConnect: false, withCredentials: true });
