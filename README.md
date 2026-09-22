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

前置条件：Node 24、pnpm 12、PostgreSQL 17（数据库在后续步骤接入，骨架阶段暂不需要）。

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm dev
```

`pnpm dev` 会同时启动前端（http://localhost:5173）和后端（http://localhost:3000）。前端开发服务器把 `/api` 与 `/socket.io` 代理到后端，因此浏览器始终同源访问。

常用命令：

| 命令             | 作用                                   |
| ---------------- | -------------------------------------- |
| `pnpm dev`       | 同时启动前后端开发服务器               |
| `pnpm typecheck` | 全部包的 TypeScript 检查               |
| `pnpm lint`      | ESLint                                 |
| `pnpm format`    | Prettier 格式化                        |
| `pnpm test`      | Vitest                                 |
| `pnpm build`     | 构建前端产物和后端产物                 |
| `pnpm start`     | 以生产模式启动后端，并托管已构建的前端 |

## 生产运行

```bash
pnpm install --frozen-lockfile
pnpm build
NODE_ENV=production pnpm start
```

单个进程同时提供 `/api/*`、`/socket.io` 和前端静态文件。Railway 会注入 `PORT`，其余环境变量见 `apps/server/.env.example`。

## 许可证

[MIT](LICENSE)
