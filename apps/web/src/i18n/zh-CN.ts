/**
 * 界面文案集中在这里，组件里不要直接写中文。
 * 以后要支持多语言时，只需要按同样的结构再加一个文件。
 */
export const t = {
  appName: '小蜜蜂',
  tagline: '一个轻量的实时聊天应用',
  status: {
    title: '系统状态',
    server: '服务器',
    database: '数据库',
    realtime: '实时连接',
    checking: '检查中',
    ok: '正常',
    error: '异常',
    online: '已连接',
    offline: '已断开',
    connecting: '连接中',
  },
  theme: {
    light: '浅色',
    dark: '深色',
    system: '跟随系统',
    toggle: '切换主题',
  },
  footer: '骨架与数据库已就绪。下一步：账号系统。',
} as const;
