import { type Locator, type Page, expect, test } from '@playwright/test';
import { befriend, messages, twoUsers } from './helpers';

/**
 * 手机端的关键路径，用 Pixel 7 的视口和触屏跑（见 playwright.config.ts 里的 mobile 项目）。
 * 这里只测手机上才有的东西：底部标签栏、全屏聊天、长按消息、底部弹层；业务流程由 chat.spec.ts 覆盖。
 */

/** 任何一屏都不能比视口宽，否则页面能左右滑动 */
async function expectNoHorizontalOverflow(page: Page) {
  // 用字符串表达式：这份测试代码按 Node 的类型检查，里面没有 document 和 window
  const overflow = (await page.evaluate(
    'document.documentElement.scrollWidth - window.innerWidth',
  )) as number;
  expect(overflow).toBeLessThanOrEqual(0);
}

/** 真实的长按：手指按住约 0.7 秒再抬起 */
async function longPress(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('long press target is not visible');
  const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(700);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}

const tabBar = (page: Page) => page.getByRole('navigation', { name: '主导航' });

test('底部标签栏在会话、好友、我之间切换，页面不会左右溢出', async ({ browser }) => {
  const { pageA, alice, close } = await twoUsers(browser);
  try {
    await expect(tabBar(pageA)).toBeVisible();
    await expectNoHorizontalOverflow(pageA);

    await tabBar(pageA).getByRole('link', { name: '好友' }).tap();
    await expect(pageA.getByRole('heading', { name: '好友', exact: true })).toBeVisible();
    await expect(pageA.getByPlaceholder('输入用户名搜索')).toBeVisible();
    await expectNoHorizontalOverflow(pageA);

    await tabBar(pageA).getByRole('link', { name: '我' }).tap();
    await expect(pageA.getByText(`@${alice}`)).toBeVisible();
    await expectNoHorizontalOverflow(pageA);

    // 主题开关在“我”里
    await pageA.getByRole('button', { name: '深色' }).tap();
    await expect(pageA.locator('html')).toHaveClass(/dark/);

    // 编辑资料从底部弹出，贴着屏幕下沿
    await pageA.getByRole('button', { name: /编辑资料/ }).tap();
    const sheet = pageA.getByRole('dialog');
    await expect(sheet.getByText('个人资料')).toBeVisible();
    // 等滑入动画放完再量位置
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        const viewport = pageA.viewportSize();
        return box && viewport ? Math.abs(box.y + box.height - viewport.height) : 999;
      })
      .toBeLessThanOrEqual(1);
    await pageA.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await pageA.getByRole('button', { name: '退出登录' }).tap();
    await expect(pageA.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  } finally {
    await close();
  }
});

test('聊天全屏显示，回车换行、按钮发送，长按消息弹出操作层', async ({ browser }) => {
  const { pageA, pageB, alice, bob, close } = await twoUsers(browser);
  try {
    await befriend(pageA, pageB);

    // 进入会话后标签栏收起，左上角是返回
    await pageA.getByRole('link', { name: new RegExp(bob) }).tap();
    await expect(tabBar(pageA)).toBeHidden();
    await expect(pageA.getByRole('link', { name: '返回' })).toBeVisible();
    await expectNoHorizontalOverflow(pageA);

    // 触屏上回车是换行，点发送按钮才发出去
    const composer = pageA.getByPlaceholder('输入消息');
    await composer.fill('第一行');
    await composer.press('Enter');
    await composer.pressSequentially('第二行');
    await expect(messages(pageA).getByText('第一行')).toHaveCount(0);
    await pageA.getByRole('button', { name: '发送', exact: true }).tap();
    await expect(messages(pageA).getByText('第一行')).toBeVisible();
    await expect(messages(pageA).getByText('第二行')).toBeVisible();
    await expect(composer).toHaveValue('');

    // bob 打开会话，长按这条消息：底部弹出表情和操作
    await pageB.getByRole('link', { name: new RegExp(alice) }).tap();
    const bubble = messages(pageB).getByText('第一行');
    await expect(bubble).toBeVisible();
    await longPress(pageB, bubble);
    const sheet = pageB.getByRole('dialog');
    await expect(sheet.getByRole('button', { name: '回复' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: '复制' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: '举报' })).toBeVisible();
    await sheet.getByRole('button', { name: '👍' }).tap();
    await expect(sheet).toBeHidden();
    await expect(messages(pageB).getByRole('button', { name: /👍\s*1/ })).toBeVisible();
    await expect(messages(pageA).getByRole('button', { name: /👍\s*1/ })).toBeVisible();

    // 再长按选“回复”，输入框上方出现引用条
    await longPress(pageB, bubble);
    await pageB.getByRole('dialog').getByRole('button', { name: '回复' }).tap();
    await expect(pageB.getByText(`回复 ${alice}`)).toBeVisible();

    // 标题栏的“更多”里有置顶；置顶后回到列表能看到图钉
    await pageB.getByRole('button', { name: '更多' }).tap();
    await pageB.getByRole('dialog').getByRole('button', { name: '置顶' }).tap();
    await pageB.getByRole('link', { name: '返回' }).tap();
    await expect(tabBar(pageB)).toBeVisible();
    await expect(pageB.getByLabel('置顶')).toBeVisible();
  } finally {
    await close();
  }
});

test('好友页：次要操作收进“更多”，拉黑要在弹层里确认', async ({ browser }) => {
  const { pageA, pageB, bob, close } = await twoUsers(browser);
  try {
    await befriend(pageA, pageB);
    await tabBar(pageA).getByRole('link', { name: '好友' }).tap();
    await expect(pageA.getByText(`@${bob}`)).toBeVisible();
    await expectNoHorizontalOverflow(pageA);

    await pageA.getByRole('button', { name: '更多' }).tap();
    await pageA.getByRole('dialog').getByRole('button', { name: '拉黑' }).tap();
    // 第二个弹层是确认：说明后果，按钮上写的是动作本身
    const confirm = pageA.getByRole('dialog');
    await expect(confirm.getByText(/会解除好友关系/)).toBeVisible();
    await confirm.getByRole('button', { name: '拉黑', exact: true }).tap();

    await expect(pageA.getByText('还没有好友')).toBeVisible();
    await expect(pageA.getByText('黑名单')).toBeVisible();
    await expectNoHorizontalOverflow(pageA);
  } finally {
    await close();
  }
});
