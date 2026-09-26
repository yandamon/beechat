# 小蜜蜂 · beechat

一个轻量的实时聊天应用：一对一私聊与小群、文本与图片、在线状态、多端同步。用 React、Fastify、Socket.IO 和 PostgreSQL 从零搭建，作为全栈学习与作品集项目。

> **English:** beechat is a small real-time chat app (1:1 and group chat, text and images, presence, multi-device sync) built from scratch with React 19, Fastify 5, Socket.IO and PostgreSQL as a full-stack learning and portfolio project. The UI is Chinese-only for now; all strings live in one file so localisation is mechanical. See [docs/DESIGN.md](docs/DESIGN.md) for every product and technical decision.

## 当前进度

- 已完成：账号注册登录、演示账号一键登录（数据每天重置，助手会自动回复）、个人资料（显示名、头像、退出所有设备、注销账号）、好友搜索与申请、拉黑与黑名单、举报、一对一私聊、群聊（建群、改名、群头像、邀请、移出、退群与群主转让）、文本与图片消息、引用回复、消息回应、表情选择器、消息实时收发与幂等重试、两分钟内撤回、私聊已读回执、会话置顶与免打扰、历史分页、未读数与多端已读同步、在线状态、正在输入、桌面通知与离线推送、断线提示、深色模式、PWA 可安装、Railway 部署、Playwright 端到端测试。
- 待办：线上图片存储切换到 Cloudflare R2（需要填写密钥）。
- 计划：见 [docs/DESIGN.md](docs/DESIGN.md) 第 2 与 11 节。

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

`.env` 里的 `INVITE_CODE` 是注册时必须填写的邀请码，本地默认 `beechat-dev`；`DEMO_ENABLED` 控制登录页的“试用演示账号”入口，默认开启。服务启动时会自动应用 `apps/server/drizzle` 里尚未执行的迁移。测试使用 `apps/server/.env.test`，内容与 `.env` 相同但指向 `beechat_test`。离线推送是可选的：同时填写 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` 才会启用（生成密钥：`pnpm --filter @beechat/server exec web-push generate-vapid-keys`），没填时"开启桌面通知"只在页面开着时提醒。

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

## 图片存储

图片和头像在浏览器里压缩后直传到对象存储，服务器不经手文件字节。存储驱动由 `STORAGE_DRIVER` 决定：

- `local`（默认）：文件存在 `UPLOADS_DIR`，由本服务在 `/uploads/` 下提供。适合开发；Railway 的磁盘是临时的，重新部署后文件会丢。
- `r2`：存到 Cloudflare R2。需要在 Railway 里设置 `STORAGE_DRIVER=r2` 以及 `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`、`R2_PUBLIC_URL`。

R2 的准备步骤：

1. 在 R2 里新建桶 `beechat`，在桶的 Settings 里开启公开访问（r2.dev 域名或自定义域名），得到的地址就是 `R2_PUBLIC_URL`（不带末尾斜杠）。
2. 在同一页的 CORS Policy 里允许站点来源的直传：

```json
[
  {
    "AllowedOrigins": ["https://beechat-production-a1d7.up.railway.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

3. 在 R2 的 Manage API Tokens 里创建一个只对这个桶有 Object Read & Write 权限的令牌，拿到 Access Key ID 和 Secret Access Key；Account ID 在 R2 概览页右侧。

## 端到端测试

`pnpm e2e` 会用 `NODE_ENV=test` 拉起后端（读取 `apps/server/.env.test`）和前端开发服务器，先清空测试库，再用真实浏览器跑注册、加好友、实时聊天、群聊、演示账号、拉黑和举报。首次运行前安装浏览器：

```bash
pnpm --filter @beechat/web exec playwright install chromium
```

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
3. 在服务的 Variables 里添加 `NODE_ENV=production`、`DATABASE_URL=<Neon 连接串>`、`INVITE_CODE=<自定的邀请码>`；要开启离线推送再加上 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`（见"本地开发"）。
4. Settings 里 Networking 一栏点 Generate Domain，得到公网地址。

仓库连接时没有安装 Railway 的 GitHub App，推送不会自动触发部署；在 Railway 控制台的 Settings 里连接 GitHub 账号后即可自动部署，或者在仓库根目录用 CLI 手动部署：

````bash
railway up --service beechat --ci
```当前线上地址：https://beechat-production-a1d7.up.railway.app

## 许可证

[MIT](LICENSE)
````
