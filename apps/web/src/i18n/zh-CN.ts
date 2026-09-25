/**
 * 界面文案集中在这里，组件里不要直接写中文。
 * 以后要支持多语言时，只需要按同样的结构再加一个文件。
 */
export const t = {
  appName: '小蜜蜂',
  tagline: '一个轻量的实时聊天应用',
  common: {
    loading: '加载中…',
    loadFailed: '加载失败，请刷新页面重试',
    submitting: '请稍候…',
    logout: '退出登录',
  },
  auth: {
    loginTitle: '登录',
    loginDescription: '欢迎回来',
    registerTitle: '注册',
    registerDescription: '需要邀请码才能注册',
    username: '用户名',
    usernameHint: '3 到 20 位小写字母、数字或下划线',
    password: '密码',
    passwordHint: '至少 8 位',
    inviteCode: '邀请码',
    loginButton: '登录',
    registerButton: '注册',
    noAccount: '还没有账号？',
    haveAccount: '已有账号？',
    toRegister: '去注册',
    toLogin: '去登录',
  },
  home: {
    greeting: (name: string) => `你好，${name}`,
    placeholder: '会话列表和聊天窗口下一步就来。',
  },
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
} as const;
