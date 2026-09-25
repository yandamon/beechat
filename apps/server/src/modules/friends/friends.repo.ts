import { and, eq } from 'drizzle-orm';
import type { DbLike } from '../../db/client';
import { friendships } from '../../db/schema';

export async function getFriendIds(db: DbLike, userId: number): Promise<number[]> {
  const rows = await db
    .select({ friendId: friendships.friendId })
    .from(friendships)
    .where(and(eq(friendships.userId, userId), eq(friendships.status, 'friend')));
  return rows.map((row) => row.friendId);
}

export async function areFriends(db: DbLike, userId: number, otherId: number): Promise<boolean> {
  const [row] = await db
    .select({ userId: friendships.userId })
    .from(friendships)
    .where(
      and(
        eq(friendships.userId, userId),
        eq(friendships.friendId, otherId),
        eq(friendships.status, 'friend'),
      ),
    )
    .limit(1);
  return row !== undefined;
}
