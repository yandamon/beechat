import { expect, test } from '@playwright/test';
import { befriend, messages, twoUsers } from './helpers';

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

test('拉黑好友后对方无法再申请，解除拉黑后恢复', async ({ browser }) => {
  const { pageA, pageB, alice, bob, close } = await twoUsers(browser);
  try {
    await befriend(pageA, pageB);

    // alice 在好友页拉黑 bob：好友列表清空，黑名单里出现 bob
    await pageA.goto('/friends');
    await pageA.getByRole('button', { name: '拉黑', exact: true }).click();
    // 确认弹层里说明后果，按钮上写的是动作本身
    await pageA.getByRole('dialog').getByRole('button', { name: '拉黑', exact: true }).click();
    await expect(pageA.getByText('还没有好友')).toBeVisible();
    const blocked = pageA.locator('section', { hasText: '黑名单' });
    await expect(blocked.getByText(bob, { exact: true })).toBeVisible();

    // bob 这边好友也没了，再申请会被拒绝
    await pageB.goto('/friends');
    await expect(pageB.getByText('还没有好友')).toBeVisible();
    await pageB.getByPlaceholder('输入用户名搜索').fill(alice);
    await pageB.getByRole('button', { name: '加好友' }).click();
    await expect(pageB.getByText('无法添加该用户')).toBeVisible();

    // alice 解除拉黑后，bob 可以重新申请
    await pageA.getByRole('button', { name: '解除拉黑' }).click();
    await expect(pageA.getByText('黑名单')).toBeHidden();
    await pageB.getByRole('button', { name: '加好友' }).click();
    await expect(pageB.getByText('已申请')).toBeVisible();
  } finally {
    await close();
  }
});

test('举报一条消息', async ({ browser }) => {
  const { pageA, pageB, alice, bob, close } = await twoUsers(browser);
  try {
    await befriend(pageA, pageB);

    // bob 发一条广告
    await pageB.goto('/');
    await pageB.getByRole('link', { name: new RegExp(alice) }).click();
    const composerB = pageB.getByPlaceholder(/输入消息/);
    await composerB.fill('加我微信有好货');
    await composerB.press('Enter');

    // alice 打开会话，悬停消息点“举报”，填原因提交
    await pageA.goto('/');
    await pageA.getByRole('link', { name: new RegExp(bob) }).click();
    const bubble = messages(pageA).getByText('加我微信有好货');
    await expect(bubble).toBeVisible();
    await bubble.hover();
    await messages(pageA).getByRole('button', { name: '举报' }).click();
    const dialog = pageA.getByRole('dialog');
    await expect(dialog.getByText('加我微信有好货')).toBeVisible();
    await dialog.getByLabel('垃圾广告').check();
    await dialog.getByPlaceholder('补充说明（可选）').fill('广告');
    await dialog.getByRole('button', { name: '提交举报' }).click();
    await expect(dialog.getByText('已收到你的举报')).toBeVisible();
    await pageA.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  } finally {
    await close();
  }
});
