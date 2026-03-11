# ADR-001: 平台采用单仓全栈 + Vercel + Supabase

## 决策

采用单仓全栈实现：

- Next.js App Router
- Vercel 承载前端与轻后端
- Supabase 负责持久化存储

## 原因

- 便于一次性交付
- 前后端共享类型与业务规则
- 最适合当前“快速落地 + 后续持续迭代”的目标
- 方便用固定生产域名承接 TP-LINK 回调

## 影响

- 初期开发效率高
- 真实联调依赖部署后的稳定 Vercel Production URL
- 后续如有更复杂的异步与队列需求，可再拆出独立服务

