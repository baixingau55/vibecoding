# 占位 / Mock / 待替换清单

## 目的
记录所有“部署前为了本地开发、演示、测试而保留的 mock、占位、内存兜底、假购买、假媒体、假回调”。
后续接入真实环境时，必须按这份清单逐项替换。

## 当前登记

### 1. 内存仓库
- 文件：`src/lib/repositories/memory-store.ts`
- 当前行为：业务读写默认走进程内内存快照。
- 替换方式：上线后改为 Supabase Repository 优先，内存仓库只保留给本地 demo / 单测。

### 2. 种子业务数据
- 文件：`src/lib/mock-data.ts`
- 当前行为：预置算法、设备、任务、执行记录、消息、媒体、购买历史、余额。
- 替换方式：改为 Supabase seed 或管理后台初始化。

### 3. 标准算法列表兜底
- 文件：`src/lib/domain/algorithms.ts`
- 当前行为：拉 TP-LINK 算法失败时，自动回退到本地标准算法种子数据。
- 替换方式：真实环境下优先使用 TP-LINK 数据，必要时仅保留“接口失败提示”，不再静默回退。

### 4. TP-LINK 设备查询接口路径
- 文件：`src/lib/tplink/client.ts`
- 当前行为：`fetchTpLinkDeviceByQrCode` 仍基于文档推断路径，失败时回退本地设备。
- 替换方式：联调后用真实可用路径和字段映射替换。

### 5. 消息订阅初始化路径
- 文件：`src/lib/tplink/client.ts`
- 当前行为：消息订阅配置接口是按文档推断接入。
- 替换方式：部署到 Vercel 后，用真实联调结果修正 path、payload、签名密钥设置流程。

### 6. AI 任务执行模拟结果
- 文件：`src/lib/domain/tasks.ts`
- 当前行为：即使尝试调用真实 TP-LINK 接口，当前仍会补一层本地模拟结果，保证页面流程可走通。
- 替换方式：正式环境中改为“真实回调 + 轮询兜底”，关闭本地结果模拟分支。

### 7. AI 回调入库
- 文件：`src/app/api/callbacks/tplink/ai-task/route.ts`
- 当前行为：只回 `received: true`，还没有按真实 payload 做落库。
- 替换方式：部署后根据真实 payload 结构完成结果、失败、消息、媒体映射并写入 Supabase。

### 8. 消息回调入库
- 文件：`src/app/api/callbacks/tplink/messages/route.ts`
- 当前行为：只回 `received: true`，还没有做签名校验和真实消息落库。
- 替换方式：部署后补齐签名校验、消息映射、媒体关联、幂等处理。

### 9. 媒体资源
- 文件：`src/lib/mock-data.ts`
- 当前行为：图片是 demo 图，录像是演示 mp4。
- 替换方式：接真实抓图和录像查询接口，统一写入 `message_media`。

### 10. 区域绘制预览图
- 文件：`src/components/tasks/region-editor.tsx`
- 当前行为：区域绘制依赖本地设备预览图，坐标编辑完全在前端完成。
- 替换方式：部署后改为真实设备快照、真实区域持久化与服务端校验。

### 11. 测试购买
- 文件：前端购买交互、`POST /api/service/purchase`
- 当前行为：站内点购买立即加次数，不做订单校验。
- 替换方式：如果后续接订单系统，保留现有 UI，替换后端购买逻辑。

### 12. Supabase 持久化
- 文件：`src/lib/supabase/client.ts` 与各 domain service
- 当前行为：Supabase client 已预留，但业务 domain 仍主要使用内存仓库。
- 替换方式：按模块逐步迁移到 Supabase：余额、任务、结果、消息、媒体、购买历史。

### 13. APP_BASE_URL
- 文件：所有 TP-LINK 回调和订阅相关逻辑
- 当前行为：本地默认 `http://localhost:3000`
- 替换方式：部署后必须换成 Vercel 正式域名，并重新执行一次消息订阅初始化。

### 14. 本地依赖缓存与测试临时目录
- 文件：`.npm-cache`、`.tmp/vitest`、`scripts/run-vitest.mjs`
- 当前行为：因为当前机器全局 npm cache / temp 目录权限不稳定，项目内使用本地 cache 和本地 temp 跑安装与测试。
- 替换方式：部署后不需要上传这些目录；它们仅用于本机开发和 CI 稳定性。

### 15. Vercel Cron 频率
- 文件：`vercel.json`
- 当前行为：为了兼容 Vercel Hobby 计划，定时任务已从按小时触发临时降级为每天一次 `0 0 * * *`。
- 替换方式：正式环境如需保持高频巡检，需改为：
  - 升级 Vercel 计划后恢复高频 cron
  - 或接入外部调度器调用 `/api/cron/run-scheduled-tasks`

## 替换顺序建议
1. 配置 Vercel 正式域名和环境变量
2. 接入 Supabase Repository
3. 确认 TP-LINK 设备查询接口
4. 确认消息订阅初始化接口
5. 完成 AI 回调落库
6. 完成消息回调落库
7. 接入真实图片 / 录像
8. 关闭本地模拟执行结果
