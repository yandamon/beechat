import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // 测试共用一个数据库，文件之间不能并行，否则互相清表
    fileParallelism: false,
  },
});
