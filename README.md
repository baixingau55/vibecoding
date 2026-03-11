# AI巡检平台

面向 TP-LINK 商用云平台开放接口的 AI 巡检控制台，采用 `Next.js + Vercel + Supabase` 单仓全栈结构。

## 本地运行

1. 复制环境变量模板

```bash
cp .env.example .env.local
```

2. 安装依赖并启动

```bash
npm install --cache .npm-cache
npm run dev
```

3. 打开 [http://localhost:3000](http://localhost:3000)

## 已实现内容

- 首页引导 / 标准算法总览
- AI算法服务概况 / 测试购买 / 次数管理
- 添加巡检任务 / 设备与检测区域配置
- 任务列表 / 任务详情 / 立即巡检 / 关闭任务
- 巡检数据看板 / 趋势图 / 排行切换
- 消息中心 / 标已读 / 图片与录像查看
- TP-LINK 签名工具、API 路由骨架、回调入口
- 项目内知识基座：需求、架构、联调、测试、运维、决策记录

## 当前实现说明

- 未配置 TP-LINK / Supabase 真实环境前，项目默认使用本地内存数据运行。
- 所有部署前占位、mock、待替换项统一记录在 [docs/operations/placeholder-register.md](docs/operations/placeholder-register.md)。
- TP-LINK 接口适配实现位于 `src/lib/tplink`。
- 数据模型和表结构草案位于 `db/schema.sql`。
- 自动化测试已覆盖：
  - 次数扣减 / 返还
  - 统计聚合
  - 任务执行规则
  - TP-LINK 签名稳定性

## 测试与构建

```bash
npm test
npm run build
```

说明：
- `npm test` 通过 `scripts/run-vitest.mjs` 强制使用项目内 `.tmp/vitest`，避免本机系统 temp 目录权限问题。
- 如果你后面部署到 Vercel，需要把 `APP_BASE_URL` 改成正式域名，并按文档重新初始化 TP-LINK 消息订阅。
