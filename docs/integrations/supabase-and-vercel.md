# Supabase 与 Vercel 使用说明

## Vercel

- 承载前端页面与轻后端 API
- 生产域名作为 TP-LINK 稳定回调地址
- 定时任务通过 `vercel.json` 的 cron 触发

## Supabase

- 作为核心业务数据库
- 通过 `SUPABASE_SERVICE_ROLE_KEY` 由服务端写入
- 未来可扩展为：
  - Edge Functions
  - Realtime
  - Storage

## 必填环境变量

- `TP_LINK_AK`
- `TP_LINK_SK`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL`
- `TP_LINK_MESSAGE_SIGN_SECRET`
- `INTERNAL_ADMIN_TOKEN`

## 部署后动作

1. 在 Vercel 配置正式环境变量
2. 部署到 Production
3. 获取 `APP_BASE_URL`
4. 用该域名生成：
   - `/api/callbacks/tplink/ai-task`
   - `/api/callbacks/tplink/messages`
5. 执行 TP-LINK 初始化动作或人工登记回调地址

