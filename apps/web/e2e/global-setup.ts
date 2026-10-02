import { truncateAll } from './db';

/** 每次跑端到端测试前清空测试库，保证用户名、邀请码和数据都是干净的 */
export default async function globalSetup() {
  await truncateAll();
}
