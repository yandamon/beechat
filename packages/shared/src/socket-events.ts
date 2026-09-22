/** Socket.IO 事件名。客户端 → 服务端。 */
export const ClientEvents = {
  messageSend: 'message:send',
  typingStart: 'typing:start',
  typingStop: 'typing:stop',
  conversationRead: 'conversation:read',
} as const;

/** Socket.IO 事件名。服务端 → 客户端。 */
export const ServerEvents = {
  messageNew: 'message:new',
  typing: 'typing',
  presence: 'presence',
  conversationUpdated: 'conversation:updated',
  conversationRead: 'conversation:read',
  friendRequest: 'friend:request',
  friendAccepted: 'friend:accepted',
} as const;

export type ClientEvent = (typeof ClientEvents)[keyof typeof ClientEvents];
export type ServerEvent = (typeof ServerEvents)[keyof typeof ServerEvents];
