import { expect, test } from '@playwright/test';
import { makeAdmin } from './db';
import { PASSWORD, register, unique } from './helpers';

test('管理员生成邀请码：一个码只能注册一个账号，作废的不能用', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const lateContext = await browser.newContext();
  try {
    const admin = await adminContext.newPage();
    const adminName = unique('root');
    await register(admin, adminName);

    // 普通用户看不到后台入口，直接输入地址也会被送回首页
    await expect(admin.getByRole('link', { name: '邀请码', exact: true })).toHaveCount(0);
    await admin.goto('/admin/invites');
    await expect(admin.getByText('还没有会话')).toBeVisible();
    expect(new URL(admin.url()).pathname).toBe('/');

    await makeAdmin(adminName);
    await admin.reload();
    await admin.getByRole('link', { name: '邀请码', exact: true }).click();
    await expect(admin.getByRole('heading', { name: '邀请码', exact: true })).toBeVisible();

    // 生成两个带备注的邀请码，结果直接显示在弹窗里
    await admin.getByRole('button', { name: '生成', exact: true }).click();
    const dialog = admin.getByRole('dialog');
    await dialog.getByLabel('数量').fill('2');
    await dialog.getByLabel('备注').fill('端到端测试');
    await dialog.getByRole('button', { name: '生成', exact: true }).click();
    await expect(dialog.getByText('已生成 2 个邀请码')).toBeVisible();
    const codes = await dialog.locator('code').allTextContents();
    expect(codes).toHaveLength(2);
    const [first, second] = codes as [string, string];
    expect(first).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    await admin.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // 默认看的是“未使用”，两个新码都在
    await expect(admin.getByText(first)).toBeVisible();
    await expect(admin.getByText(second)).toBeVisible();

    // 新用户打开邀请链接：邀请码已经填好，注册成功
    const guest = await guestContext.newPage();
    const guestName = unique('guest');
    await guest.goto(`/register?code=${first}`);
    await expect(guest.getByLabel('邀请码')).toHaveValue(first);
    await guest.getByLabel('用户名').fill(guestName);
    await guest.getByLabel('密码').fill(PASSWORD);
    await guest.getByRole('button', { name: '注册' }).click();
    await expect(guest.getByText('还没有会话')).toBeVisible();

    // 同一个码，第二个人用不了
    const late = await lateContext.newPage();
    await late.goto(`/register?code=${first}`);
    await late.getByLabel('用户名').fill(unique('late'));
    await late.getByLabel('密码').fill(PASSWORD);
    await late.getByRole('button', { name: '注册' }).click();
    await expect(late.getByText('邀请码已被使用')).toBeVisible();

    // 后台里这个码到了“已使用”，能看到是谁用的
    await admin.getByRole('button', { name: /^已使用/ }).click();
    const usedRow = admin.locator('li', { hasText: first });
    await expect(usedRow).toBeVisible();
    await expect(usedRow.getByText(`@${guestName}`)).toBeVisible();

    // 作废第二个码：从“未使用”里消失，之后用它注册会被拒绝
    await admin.getByRole('button', { name: /^未使用/ }).click();
    await admin.locator('li', { hasText: second }).getByRole('button', { name: '作废' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: '作废', exact: true }).click();
    await expect(admin.getByText(second)).toHaveCount(0);
    await late.getByLabel('邀请码').fill(second);
    await late.getByRole('button', { name: '注册' }).click();
    await expect(late.getByText('邀请码已作废')).toBeVisible();
  } finally {
    await Promise.all([adminContext.close(), guestContext.close(), lateContext.close()]);
  }
});
