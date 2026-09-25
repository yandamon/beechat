import type { RelationStatus, UserSearchResult } from '@beechat/shared';
import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import type { AppContext } from '../../context';
import { friendRequests, friendships, users } from '../../db/schema';
import { toPublicUser } from '../../lib/views';

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/** 按用户名模糊搜索，最多 20 条，并附带我和每个人的关系 */
export async function searchUsers(
  ctx: AppContext,
  meId: number,
  query: string,
): Promise<UserSearchResult[]> {
  const { db } = ctx;
  const rows = await db
    .select()
    .from(users)
    .where(ilike(users.username, `%${escapeLike(query.toLowerCase())}%`))
    .orderBy(users.username)
    .limit(20);

  const otherIds = rows.map((row) => row.id).filter((id) => id !== meId);
  const relations = new Map<number, RelationStatus>();

  if (otherIds.length > 0) {
    const friendRows = await db
      .select({ friendId: friendships.friendId })
      .from(friendships)
      .where(
        and(
          eq(friendships.userId, meId),
          eq(friendships.status, 'friend'),
          inArray(friendships.friendId, otherIds),
        ),
      );
    for (const row of friendRows) relations.set(row.friendId, 'friend');

    const pendingRows = await db
      .select({ fromUserId: friendRequests.fromUserId, toUserId: friendRequests.toUserId })
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.status, 'pending'),
          or(
            and(eq(friendRequests.fromUserId, meId), inArray(friendRequests.toUserId, otherIds)),
            and(eq(friendRequests.toUserId, meId), inArray(friendRequests.fromUserId, otherIds)),
          ),
        ),
      );
    for (const row of pendingRows) {
      if (row.fromUserId === meId) relations.set(row.toUserId, 'pending_outgoing');
      else relations.set(row.fromUserId, 'pending_incoming');
    }
  }

  return rows.map((row) => ({
    ...toPublicUser(row),
    relation: row.id === meId ? 'self' : (relations.get(row.id) ?? 'none'),
  }));
}
