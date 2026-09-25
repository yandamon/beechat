/** 一个用户的所有连接都在这个房间里，按用户推送或多端同步时用 */
export const userRoom = (userId: number) => `user:${userId}`;

/** 会话的全部成员连接都在这个房间里 */
export const conversationRoom = (conversationId: number) => `conversation:${conversationId}`;
