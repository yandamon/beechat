# 小蜜蜂（beechat）设计文档

> 状态：已确认，2026-09-22。本文档是全部产品与技术决定的唯一来源：先改这里，再改代码。
>
> 进度：2026-09-26 v1 范围内的功能已全部实现并有测试覆盖，v1.1 中的撤回、私聊已读回执、桌面通知、引用回复、注销账号、演示助手、拉黑、举报也已完成；线上图片存储仍用本地驱动，等 R2 密钥填入后切换。

## 1. 定位与目标

- 学习与作品集项目，但按真实产品标准搭建：账号体系、消息持久化、真正公网上线。
- 一人开发，目标四周内交付可公网访问的 MVP。
- 规模：按几百到几千人同时在线的架构设计，按单机免费额度部署。代码中不得写死单机假设，例如把在线状态放在不可替换的进程内存里。
- 预算：每月 5 美元以内。

## 2. 范围

### v1（MVP）

- 会话：一对一私聊、小群（最多 200 人）。统一建模为“带成员列表的会话”，一对一是成员恰好两人的特例。
- 消息：文本（不超过 2000 字）、图片（不超过 5 MB，客户端压缩到最长边 1920 像素）、原生 emoji 选择器。
- 实时：正在输入提示、在线或离线状态、多端同时在线。
- 同步：历史消息、离线消息（重连后按游标拉取）、未读数。
- 账号：用户名加密码注册（需邀请码）、按用户名搜索、好友申请与同意、显示名、头像上传。
- 演示：固定演示账号 `demo` 一键登录，附带助手私聊、示例群和三位好友；登录时若距上次生成超过一天则整体删除重建，用 pg 咨询锁避免并发重复重置。演示账号们的密码是随机的，只能通过演示入口进入。
- PWA：可安装，vite-plugin-pwa 生成清单与 Service Worker，仅预缓存应用壳，`/api` 与 `/socket.io` 永远走网络。

### v1.1

Web 推送。已提前完成：举报（`reports` 表记录举报人、被举报人、消息快照与原因，只落库并打 warn 日志供人工处理，没有后台界面；同一人对同一条消息只记一次）、拉黑（`friendships` 里一行单向的 `blocked`；拉黑即解除好友并删除双方待处理的申请，之后双方都不能在原私聊里发消息，被拉黑方申请加好友时只得到“无法添加该用户”，拉黑方在搜索结果和黑名单里可以解除）、自定义群头像（群主通过 PATCH /api/conversations/:id 设置 avatarKey）、消息回应（message_reactions 表，固定六个表情，汇总广播）、置顶与免打扰（conversation_members.pinned/muted，仅影响本人；免打扰不弹通知、不计入标题未读）、引用回复（`messages.reply_to_id` 自引用，视图带 80 字摘要）、注销账号（密码确认，退群转让、删私聊、清文件后删用户）、演示助手自动回复（仅对与 beebot 的私聊生效）、私聊已读回执（`conversation:read` 推给整个会话）、两分钟内撤回（软删除并广播 `message:updated`，历史里保留占位）、桌面通知（页面不在前台或没开着该会话时，用 Notification API 提醒，需用户在侧栏打开）。

### v2

语音消息、任意文件、消息搜索、语音与视频通话。

### 明确不做

频道或服务器模式、公共匿名聊天室、端到端加密、邮箱或手机号或第三方登录（暂不做）。

## 3. 产品规则

### 3.1 账号与身份

- 用户名：3 到 20 位小写字母、数字、下划线；大小写不敏感唯一；注册后不可改。
- 显示名：不超过 30 字，可改、可重复。
- 密码：至少 8 位，无复杂度要求，不过期；argon2id 哈希存储。
- 头像：可上传，客户端缩放并居中裁成 256 × 256；未上传时显示首字母。
- 注册需要邀请码（环境变量 `INVITE_CODE`），可随时更换。
- 登录态 30 天滚动有效；提供“退出所有设备”。

### 3.2 好友

- 搜索用户名，发送申请（可附不超过 100 字的验证消息），对方同意或拒绝；被拒可再申请，不设冷却。
- 只有好友之间才能私聊；群内非好友需先加好友。
- 删除好友：保留会话与历史，双方不能再发新消息，重新成为好友后恢复。
- 拉黑是单向的：只在拉黑方那一行记 `blocked`，被拉黑方看不出自己被拉黑；解除拉黑不会自动恢复好友关系，需要重新申请。

### 3.3 群

- 任何用户可建群，建群者为群主。
- 任何成员可邀请自己的好友；成员可自行退群；群主可踢人、改群名。
- 群主退群时自动转给最早加入的成员，群不解散。
- 群名不超过 30 字；v1 群头像按首字母生成。

### 3.4 多端

同一账号可在多个标签页或设备同时在线；在线状态等于“任一连接在线”；未读与已读以账号为单位，不以连接为单位。

### 3.5 数据保留

消息永久保留；撤回与删除用软删除；注销账号放 v1.1，但所有外键从一开始就带级联规则。

### 3.6 界面

中文界面；所有文案集中在 `apps/web/src/i18n/zh-CN.ts`；深色模式从第一天支持；响应式布局，手机浏览器可用。

## 4. 技术选型

| 领域   | 决定                                                            | 理由                                             |
| ------ | --------------------------------------------------------------- | ------------------------------------------------ |
| 语言   | TypeScript 全栈                                                 | React 开发者复用 JS 能力；前后端共享类型         |
| 仓库   | pnpm monorepo：`apps/web`、`apps/server`、`packages/shared`     | 共享 zod schema、事件名、常量零成本              |
| 前端   | Vite + React 19 + React Router 8，单页应用                      | 登录后应用无 SEO 需求；WebSocket 客户端最直接    |
| UI     | Tailwind v4 + shadcn/ui（base-nova 预设）                       | 聊天界面大量自定义，只需可访问的基础件           |
| 状态   | TanStack Query 管服务端数据，Zustand 管 socket 与 UI 状态       | 两类状态边界清晰                                 |
| 后端   | Fastify 5 + zod                                                 | TypeScript 友好、性能好、插件齐全                |
| 接口   | REST 负责增删改查，Socket.IO 负责实时事件                       | 通用、好测、易读                                 |
| 实时   | Socket.IO 4                                                     | 重连、房间、确认回调现成；将来可接 Redis adapter |
| 数据库 | PostgreSQL 17；本地原生安装，线上 Neon 新加坡区域               | 不写死单机；最通用                               |
| ORM    | Drizzle                                                         | TypeScript 优先、贴近 SQL、自带迁移              |
| 鉴权   | 数据库 Session + httpOnly Cookie；Socket.IO 握手复用 Cookie     | 同源零配置、可随时吊销                           |
| 图片   | Cloudflare R2，预签名直传；Storage 接口，本地开发用磁盘         | 免费额度大、无流量费、不占服务器带宽             |
| 部署   | 单个 Railway 服务（新加坡）同时提供 API、WebSocket、静态前端    | 单一来源，无 CORS 与跨站 Cookie 问题             |
| 测试   | Vitest 单元 + 真实测试库集成 + Playwright 关键流程              | 作品集证据，不拖节奏                             |
| 规范   | ESLint + Prettier（Tailwind 类名排序）、GitHub Actions、Node 24 | 团队通用做法                                     |
| 日志   | Fastify 自带 pino；v1 不接错误监控                              | 够用                                             |

### 4.1 否决的方案

- Supabase 或 Firebase：会把实时投递、在线状态、离线同步封装掉，而这正是要学的部分；Supabase Auth 默认要邮箱。
- Next.js：SSR 与 RSC 在纯登录后应用没有收益，且 WebSocket 服务需要另行部署。
- 端到端加密：历史同步、多端、图片预览、搜索全部变难数倍。
- JWT：刷新流程复杂、吊销困难；同源 Cookie Session 更简单。
- SQLite：零运维但天然单机，与“不写死单机”冲突。
- 前后端分开托管：跨站 Cookie 和 CORS 给一个人的项目平添复杂度。

## 5. 架构

### 5.1 运行拓扑

```
浏览器 ──HTTPS / WSS──▶ Railway：Fastify（/api/*、/socket.io、静态 SPA）
                            ├──▶ Neon PostgreSQL
                            └──▶ Cloudflare R2（浏览器用预签名 URL 直传、直读）
```

开发时 Vite（5173）把 `/api` 与 `/socket.io` 代理到 Fastify（3000），同样保持同源。

### 5.2 目录结构

```
beechat/
├── apps/
│   ├── web/                 # Vite + React 单页应用
│   │   └── src/
│   │       ├── components/  # 通用组件；ui/ 下是 shadcn 生成的基础件
│   │       ├── i18n/        # 界面文案
│   │       ├── lib/         # api 封装、socket 实例、工具
│   │       ├── routes/      # 页面
│   │       └── stores/      # zustand 状态
│   └── server/              # Fastify + Socket.IO + Drizzle
│       └── src/
│           ├── app.ts       # 组装 Fastify 实例（可测试）
│           ├── realtime.ts  # Socket.IO 挂载
│           ├── config.ts    # 环境变量校验
│           └── index.ts     # 进程入口
├── packages/
│   └── shared/              # zod schema、类型、事件名、常量
├── docs/DESIGN.md           # 本文档
├── .github/workflows/ci.yml
├── pnpm-workspace.yaml
└── .nvmrc                   # 24
```

后续按功能加目录：`server/src/db`（schema、迁移）、`server/src/modules/<feature>`（路由 + 服务）、`web/src/features/<feature>`。

### 5.3 环境变量

| 变量             | 用途                                     | 何时启用       |
| ---------------- | ---------------------------------------- | -------------- |
| `PORT`、`HOST`   | 监听端口与地址，Railway 自动注入 `PORT`  | 现在           |
| `LOG_LEVEL`      | pino 日志级别                            | 现在           |
| `DATABASE_URL`   | Postgres 连接串；测试从 `.env.test` 读取 | 现在           |
| `INVITE_CODE`    | 注册邀请码，常数时间比较                 | 现在           |
| `DEMO_ENABLED`   | 是否开放演示账号一键登录，默认 true      | 现在           |
| `RATE_LIMIT`     | 限流开关，默认 true；端到端测试关掉      | 现在           |
| `STORAGE_DRIVER` | `local` 或 `r2`，默认 local              | 现在           |
| `UPLOADS_DIR`    | 本地驱动的存储目录，默认 ./uploads       | 现在           |
| `R2_*`           | R2 账号、密钥、桶名、公开地址；r2 时必填 | 切换 R2 时     |
| `STORAGE_DRIVER` | `local` 或 `r2`                          | 图片上传接入后 |
| `R2_*`           | R2 账号、密钥、桶名、公开地址            | 图片上传接入后 |

## 6. 数据模型

PostgreSQL，Drizzle 管理迁移，服务启动时自动应用。所有表带 `created_at`；外键全部带级联删除，为 v1.1 的注销账号预留。主键：`users`、`conversations`、`friend_requests` 用整数自增；`messages` 用 bigint 自增，因为它同时是排序与分页游标；`sessions` 的主键是令牌的哈希。

| 表                     | 字段要点                                                                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                | `id`、`username`（唯一，大小写不敏感）、`display_name`、`password_hash`、`avatar_key`、`last_seen_at`                                                                                                             |
| `sessions`             | `id`（随机令牌的哈希）、`user_id`、`expires_at`、`user_agent`                                                                                                                                                     |
| `friend_requests`      | `id`、`from_user_id`、`to_user_id`、`message`、`status`（pending、accepted、rejected）、`responded_at`                                                                                                            |
| `friendships`          | `user_id`、`friend_id`、`status`（friend、blocked）；每对好友两行，方便按方向查询与拉黑                                                                                                                           |
| `conversations`        | `id`、`type`（direct、group）、`name`、`owner_id`、`avatar_key`、`direct_key`（一对一会话唯一键，`minId:maxId`）、`last_message_at`                                                                               |
| `conversation_members` | `conversation_id`、`user_id`、`role`（owner、member）、`last_read_message_id`、`joined_at`                                                                                                                        |
| `messages`             | `id`（bigserial，用于排序与分页）、`conversation_id`、`sender_id`、`type`（text、image、system）、`content`、`attachment_key`、`attachment_meta`（宽高、大小）、`client_id`（幂等键，按发送者唯一）、`deleted_at` |
| `uploads`              | `key`、`owner_id`、`mime`、`size`；用于追踪和清理 R2 对象                                                                                                                                                         |
| `reports`              | `reporter_id`、`target_user_id`、`message_id`（消息删除后置空）、`reason`、`detail`、`snapshot`（举报时的消息内容）；只供人工处理                                                                                 |

## 7. 实时协议与消息投递

### 7.1 事件

客户端发出：`message:send`（带确认回调）、`typing:start`、`typing:stop`、`conversation:read`。

服务端推送：`message:new`、`typing`、`presence`、`conversation:updated`、`conversation:read`（同一账号多端同步未读）、`friend:request`、`friend:accepted`。

事件名与载荷类型定义在 `packages/shared/src/socket-events.ts`，前后端共用。

### 7.2 机制

1. 发送：客户端生成 `client_id`（UUID），通过 socket 发送并等待确认；服务端落库后向会话房间广播 `message:new`，再向发送方回确认。重试时相同 `client_id` 直接返回已存在的消息，不产生重复。
2. 排序与分页：以服务端自增 `id` 为序，历史按 `before=<id>` 每页 50 条向上加载。
3. 离线与多端同步：不维护待投递队列。重连后客户端按每个会话的本地最大 `id` 拉取“此后的消息”，同时覆盖离线、换设备、多标签页三种情况。
4. 未读数：每个成员每个会话存 `last_read_message_id`，未读数等于其后的消息数；读取事件同步给同一账号的其他连接。
5. 正在输入与在线状态：不落库，纯广播；输入事件客户端节流，停顿 2 秒自动发送停止；断线后延迟 10 秒再标记离线，避免刷新页面时闪烁。
6. 已读上报：会话打开且页面处于可见状态时才上报，后台标签页里收到的消息保持未读；自己发出消息即视为已读到该消息。
7. 客户端发送采用乐观更新：先以负数临时 id 插入本地列表，确认后用服务端消息按 clientId 替换，失败可用同一个 clientId 重试。
8. 连接建立时，服务端把用户加入其全部会话的房间，并订阅好友的在线状态。

## 8. REST 接口

| 分组          | 接口                                                                                                                                                                                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth          | `POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/logout`、`POST /api/auth/logout-all`、`GET /api/auth/me`、`POST /api/auth/demo`                                                                                                                                                 |
| users         | `GET /api/users/search?q=`、`PATCH /api/users/me`                                                                                                                                                                                                                                                  |
| friends       | `GET /api/friends`、`DELETE /api/friends/:userId`、`GET /api/friends/requests`、`POST /api/friends/requests`、`POST /api/friends/requests/:id/accept`、`POST /api/friends/requests/:id/reject`、`GET /api/friends/blocked`、`POST /api/friends/:userId/block`、`DELETE /api/friends/:userId/block` |
| conversations | `GET /api/conversations`、`POST /api/conversations`、`GET /api/conversations/:id`、`PATCH /api/conversations/:id`、`POST /api/conversations/:id/members`、`DELETE /api/conversations/:id/members/:userId`                                                                                          |
| messages      | `GET /api/conversations/:id/messages?before=&limit=`                                                                                                                                                                                                                                               |
| uploads       | `POST /api/uploads/presign`、`POST /api/uploads/complete`                                                                                                                                                                                                                                          |
| reports       | `POST /api/reports`                                                                                                                                                                                                                                                                                |
| health        | `GET /api/health`                                                                                                                                                                                                                                                                                  |

所有入参用 `packages/shared` 里的 zod schema 校验；错误统一返回 `{ message }`。

## 9. 安全

- HTTPS 与 WSS 由托管平台提供。
- 密码 argon2id；会话令牌为 256 位随机值，数据库只存其 sha256；Cookie `beechat_session` 为 `httpOnly`、`Secure`（生产）、`SameSite=Lax`，30 天滚动续期且每天最多写库一次。令牌本身不可伪造，因此不再需要 Cookie 签名密钥。
- 登录时用户不存在也执行一次哈希校验，避免通过响应时间探测用户名。
- 限流：登录每 IP 每分钟 5 次；注册每 IP 每小时 3 次；发消息每用户每 10 秒 20 条；上传每用户每分钟 10 次。
- 上传只允许 jpeg、png、webp、gif，服务端校验类型与大小；预签名 URL 短期有效。
- 服务端不信任客户端提供的发送者、时间戳和会话成员关系，一律以数据库为准。

## 10. 微观默认值

会话列表按最后一条消息时间倒序；历史每页 50 条；时间按浏览器本地时区显示；不接任何第三方统计；数据库备份依赖 Neon 的时间点恢复；好友数与会话数 v1 不设上限。数值常量以 `packages/shared/src/constants.ts` 为准。

## 11. 里程碑

每周末都有可部署的版本。

1. 第一周：仓库骨架、monorepo、CI、数据表与迁移、注册登录与 Session、带深色模式的页面框架；第三天左右把空壳部署到 Railway。
2. 第二周：好友搜索与申请、一对一会话、消息收发与确认、历史分页、未读数、在线状态、正在输入。
3. 第三周：群聊的建群、邀请、退群、踢人、改名与群主转让；R2 图片上传；头像；PWA 清单；手机端适配。
4. 第四周：集成测试与端到端测试、邀请码、演示账号与每日重置、README、收尾与缓冲。

## 11.1 上传流程

1. 浏览器用 canvas 把图片缩到最长边 1920（头像居中裁成 256 × 256），优先输出 webp；gif 尺寸合规时原样上传。
2. `POST /api/uploads/presign` 登记一条 uploads 记录并签发直传地址；本地驱动指向本服务的 `PUT /api/uploads/local/*`，R2 指向对象存储的预签名地址。
3. 浏览器直接 PUT 文件字节。
4. `POST /api/uploads/complete` 确认对象存在、大小不超过登记值后标记完成。
5. 发图片消息只传 key；设头像同理。消息视图和用户视图根据 key 与存储配置算出公开地址。

## 12. 准备清单

外部账号：GitHub（公开仓库 `beechat`）、Railway（新加坡区域）、Neon（新加坡区域）、Cloudflare（R2）。

本地环境：Node 24、pnpm 12、git、VS Code（ESLint、Prettier、Tailwind CSS IntelliSense 扩展）、PostgreSQL 17（`winget install PostgreSQL.PostgreSQL.17`）。

部署方式：Railway 通过 GitHub 集成自动部署 `main`，配置见仓库根目录 `railway.json`；数据库用 Neon 的直连连接串（非 pgbouncer 池化地址），迁移在服务启动时执行；环境变量 `NODE_ENV`、`DATABASE_URL`、`INVITE_CODE` 在 Railway 控制台设置，`PORT` 由平台注入。

已部署（2026-09-25）：Railway 项目 `beechat`、服务 `beechat`，仅新加坡区域，试用套餐只允许单区域；Neon 项目 `mute-scene-40761436`，新加坡，Postgres 17；线上地址 https://beechat-production-a1d7.up.railway.app 。Railway 提示 `railway.json` 这种 Config as Code 将于 2026-12-01 停用，届时迁移到 `.railway/railway.ts`。

不需要：域名、设计稿、邮件或短信服务、微信开放平台资质。
