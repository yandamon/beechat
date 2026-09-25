import { type Browser, type Page, expect, test } from '@playwright/test';

const INVITE_CODE = 'test-invite';
const PASSWORD = 'password123';

/** 聊天窗口里的消息列表；侧栏预览用的是 ul，所以 ol 只有这一个 */
const messages = (page: Page) => page.locator('main ol');

/** 用户名带时间戳，重复跑也不会撞名 */
const unique = (prefix: string) => `${prefix}_${Date.now().toString(36)}`.slice(0, 20);

async function register(page: Page, username: string) {
  await page.goto('/register');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill(PASSWORD);
  await page.getByLabel('邀请码').fill(INVITE_CODE);
  await page.getByRole('button', { name: '注册' }).click();
  await expect(page.getByText('还没有会话')).toBeVisible();
}

/** 两个独立的浏览器上下文，各自一套 Cookie，模拟两个人 */
async function twoUsers(browser: Browser) {
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
async function befriend(pageA: Page, pageB: Page) {
  const me = await (await pageA.request.get('/api/auth/me')).json();
  const created = await pageB.request.post('/api/friends/requests', {
    data: { userId: me.user.id },
  });
  expect(created.ok()).toBeTruthy();
  const { request } = await created.json();
  const accepted = await pageA.request.post(`/api/friends/requests/${request.id}/accept`);
  expect(accepted.ok()).toBeTruthy();
}

test('两个人加好友，然后实时聊天', async ({ browser }) => {
  const { pageA, pageB, alice, bob, close } = await twoUsers(browser);
  try {
    // bob 搜索 alice 并发申请
    await pageB.goto('/friends');
    await pageB.getByPlaceholder('输入用户名搜索').fill(alice);
    await pageB.getByRole('button', { name: '加好友' }).click();
    await expect(pageB.getByText('已申请')).toBeVisible();

    // alice 的“好友”入口实时出现角标，接受申请
    await expect(pageA.getByRole('link', { name: /^好友/ })).toContainText('1');
    await pageA.goto('/friends');
    await pageA.getByRole('button', { name: '接受' }).click();

    // 双方的会话列表都出现对方
    const conversationForAlice = pageA.getByRole('link', { name: new RegExp(bob) });
    await expect(conversationForAlice).toBeVisible();
    await expect(pageB.getByRole('link', { name: new RegExp(alice) })).toBeVisible();

    // alice 发消息，bob 实时收到
    await conversationForAlice.click();
    const composerA = pageA.getByPlaceholder(/输入消息/);
    await composerA.fill('你好 bob');
    await composerA.press('Enter');
    await expect(messages(pageA).getByText('你好 bob')).toBeVisible();
    // bob 还在好友页，侧栏的会话预览实时更新
    await expect(pageB.getByRole('link', { name: /你好 bob/ })).toBeVisible();

    // bob 打开会话，输入时 alice 看到“正在输入”，发送后 alice 收到
    await pageB.getByRole('link', { name: new RegExp(alice) }).click();
    await expect(messages(pageB).getByText('你好 bob')).toBeVisible();
    const composerB = pageB.getByPlaceholder(/输入消息/);
    await composerB.fill('我在打字');
    await expect(pageA.getByText('正在输入…')).toBeVisible();
    await composerB.press('Enter');
    await expect(messages(pageA).getByText('我在打字')).toBeVisible();
  } finally {
    await close();
  }
});

test('创建群聊并在群里聊天', async ({ browser }) => {
  const { pageA, pageB, alice, close } = await twoUsers(browser);
  try {
    await befriend(pageA, pageB);
    await pageA.goto('/');

    await pageA.getByRole('button', { name: '新建群聊' }).click();
    const dialog = pageA.getByRole('dialog');
    await dialog.getByLabel('群名').fill('周末小队');
    await dialog.getByRole('checkbox').first().check();
    await dialog.getByRole('button', { name: '创建' }).click();

    await expect(pageA.getByRole('heading', { name: '会话' })).toBeVisible();
    await expect(pageA.getByText('2 人')).toBeVisible();
    await expect(messages(pageA).getByText('创建了群聊')).toBeVisible();

    const composerA = pageA.getByPlaceholder(/输入消息/);
    await composerA.fill('大家好');
    await composerA.press('Enter');

    // bob 的列表里出现群，打开后看到消息和发送者名字
    await pageB.goto('/');
    const group = pageB.getByRole('link', { name: /周末小队/ });
    await expect(group).toBeVisible();
    await group.click();
    await expect(messages(pageB).getByText('大家好')).toBeVisible();
    // 群里别人的消息上方标着发送者的名字
    await expect(messages(pageB).getByText(alice, { exact: true })).toBeVisible();
  } finally {
    await close();
  }
});

test('演示账号一键登录能看到预置数据', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: '试用演示账号' }).click();
  await expect(page.getByText('小蜜蜂交流群')).toBeVisible();
  await expect(page.getByText('演示账号，数据每天重置')).toBeVisible();
  await page.getByRole('link', { name: /小蜜蜂助手/ }).click();
  await expect(page.getByText('欢迎来试用')).toBeVisible();
});
