# 小蜜蜂 · beechat

一个轻量的实时聊天应用：一对一私聊与小群、文本与图片、在线状态、多端同步。用 React、Fastify、Socket.IO 和 PostgreSQL 从零搭建，作为全栈学习与作品集项目。

> **English:** beechat is a small real-time chat app (1:1 and group chat, text and images, presence, multi-device sync) built from scratch with React 19, Fastify 5, Socket.IO and PostgreSQL as a full-stack learning and portfolio project. The UI is Chinese-only for now; all strings live in one file so localisation is mechanical. See [docs/DESIGN.md](docs/DESIGN.md) for every product and technical decision.

## 技术栈

- 前端：Vite、React 19、React Router 8、Tailwind CSS v4、shadcn/ui、TanStack Query、Zustand
- 后端：Fastify 5、Socket.IO 4、Drizzle ORM、PostgreSQL 17、zod
- 工程：pnpm monorepo、TypeScript、ESLint + Prettier、Vitest、GitHub Actions
- 部署：Railway（应用）、Neon（数据库）、Cloudflare R2（图片）

完整的产品规则、数据模型、实时协议和里程碑见 [docs/DESIGN.md](docs/DESIGN.md)。

## 目录结构

```
apps/web         Vite + React 单页应用
apps/server      Fastify + Socket.IO 服务，生产环境同时托管前端静态文件
packages/shared  前后端共享的 zod schema、类型、事件名、常量
```

## 本地开发

前置条件：Node 24、pnpm 12、PostgreSQL 17。

首次使用先以 postgres 超级用户创建角色和数据库，只需执行一次：

```sql
CREATE ROLE beechat LOGIN PASSWORD 'beechat_dev';
CREATE DATABASE beechat_dev OWNER beechat;
CREATE DATABASE beechat_test OWNER beechat;
```

然后安装依赖、准备环境变量并启动：

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm dev
```

`.env` 里的 `INVITE_CODE` 是注册时必须填写的邀请码，本地默认 `beechat-dev`。服务启动时会自动应用 `apps/server/drizzle` 里尚未执行的迁移。测试使用 `apps/server/.env.test`，内容与 `.env` 相同但指向 `beechat_test`。

`pnpm dev` 会同时启动前端（http://localhost:5173）和后端（http://localhost:3000）。前端开发服务器把 `/api` 与 `/socket.io` 代理到后端，因此浏览器始终同源访问。

常用命令：

| 命令                                        | 作用                                   |
| ------------------------------------------- | -------------------------------------- |
| `pnpm dev`                                  | 同时启动前后端开发服务器               |
| `pnpm typecheck`                            | 全部包的 TypeScript 检查               |
| `pnpm lint`                                 | ESLint                                 |
| `pnpm format`                               | Prettier 格式化                        |
| `pnpm test`                                 | Vitest                                 |
| `pnpm build`                                | 构建前端产物和后端产物                 |
| `pnpm start`                                | 以生产模式启动后端，并托管已构建的前端 |
| `pnpm --filter @beechat/server db:generate` | 根据 schema 变更生成迁移文件           |
| `pnpm --filter @beechat/server db:studio`   | 打开 Drizzle Studio 查看数据           |

## 生产运行

```bash
pnpm install --frozen-lockfile
pnpm build
NODE_ENV=production pnpm start
```

单个进程同时提供 `/api/*`、`/socket.io` 和前端静态文件。Railway 会注入 `PORT`，其余环境变量见 `apps/server/.env.example`。

## 部署到 Railway

仓库根目录的 `railway.json` 已写好构建命令、启动命令和 `/api/health` 健康检查，Railway 会从 `.nvmrc` 和 `packageManager` 读取 Node 24 与 pnpm 版本。服务启动时自动执行数据库迁移。

1. 在 Neon 新建项目（区域 Singapore，Postgres 17），复制直连的连接串。
2. Railway 里 New Project，选择 Deploy from GitHub repo，选中 `beechat`。
3. 在服务的 Variables 里添加 `NODE_ENV=production`、`DATABASE_URL=<Neon 连接串>`、`INVITE_CODE=<自定的邀请码>`。
4. Settings 里 Networking 一栏点 Generate Domain，得到公网地址。

之后每次推送到 `main` 都会自动重新部署。

## 许可证

[MIT](LICENSE)
