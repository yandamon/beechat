import { type Browser, type Page, expect } from '@playwright/test';

export const INVITE_CODE = 'test-invite';
export const PASSWORD = 'password123';

/** 聊天窗口里的消息列表；侧栏预览用的是 ul，所以 ol 只有这一个 */
export const messages = (page: Page) => page.locator('main ol');

/** 用户名带时间戳，重复跑也不会撞名 */
export const unique = (prefix: string) => `${prefix}_${Date.now().toString(36)}`.slice(0, 20);

export async function register(page: Page, username: string) {
  await page.goto('/register');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill(PASSWORD);
  await page.getByLabel('邀请码').fill(INVITE_CODE);
  await page.getByRole('button', { name: '注册' }).click();
  await expect(page.getByText('还没有会话')).toBeVisible();
}

/** 两个独立的浏览器上下文，各自一套 Cookie，模拟两个人 */
export async function twoUsers(browser: Browser) {
  const [contextA, contextB] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [pageA, pageB] = await Promise.all([contextA.newPage(), contextB.newPage()]);
  const alice = unique('alice');
  const bob = unique('bob');
  await register(pageA, alice);
  await register(pageB, bob);
  return {
    pageA,
    pageB,
    alice,
    bob,
    close: () => Promise.all([contextA.close(), contextB.close()]),
  };
}

/** 通过接口直接把两人变成好友，省掉重复点界面的时间 */
export async function befriend(pageA: Page, pageB: Page) {
  const me = await (await pageA.request.get('/api/auth/me')).json();
  const created = await pageB.request.post('/api/friends/requests', {
    data: { userId: me.user.id },
  });
  expect(created.ok()).toBeTruthy();
  const { request } = await created.json();
  const accepted = await pageA.request.post(`/api/friends/requests/${request.id}/accept`);
  expect(accepted.ok()).toBeTruthy();
}
