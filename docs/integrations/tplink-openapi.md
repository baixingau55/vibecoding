# TP-LINK 开放接口适配

## 基础信息

- Host: `api-smbcloud.tp-link.com.cn`
- 协议：HTTPS
- 请求方式：除特殊说明外均为 `POST`
- 认证方式：AK/SK + `X-Authorization`

## 已接入或预留的接口

- 标准算法列表
  - `/openapi/algorithmProduct/v1/getStandardAlgorithmBasicInfo`
- 设置算法版本
  - `/openapi/aiInspection/v1/batchSetAlgorithmVersion`
- 启动 AI 图像检测任务
  - `/openapi/aiInspection/v1/startAiInspectionTask`
- 查询任务结果
  - `/openapi/aiInspection/v1/getAiInspectionTaskResult`
- 应用级消息订阅配置
  - 当前项目预留为自动初始化步骤

## 签名规则

根据接口文档 NodeJS 示例实现：

1. `hashedRequestPayload = SHA256(payload)`
2. `credentialScope = "POST {path} tp-link_request"`
3. `stringToSign = "HmacSHA256\\n{timestamp}\\n{credentialScope}\\n{hashedRequestPayload}"`
4. `kDate = HMAC_SHA256(timestamp, SK)`
5. `kService = HMAC_SHA256(path, kDate)`
6. `kSigning = HMAC_SHA256("tp-link", kService)`
7. `signature = HMAC_SHA256(stringToSign, kSigning)`
8. `X-Authorization = Timestamp=...,Nonce=...,AccessKey=...,Signature=...,TerminalId=...`

## 字段映射

- `qrCode`：设备二维码标识
- `channelId`：默认按 `1`
- `taskId`：TP-LINK 任务 ID，需要与本地执行批次映射
- `algorithmId` / `algorithmVersion`：与本地算法模型对应
- `algorithmResult`：映射为 `QUALIFIED | UNQUALIFIED | UNAVAILABLE`
- `imageUrl` / `imageTime`：消息与统计展示使用

## 当前占位说明

项目已经接入真实签名逻辑与关键 API 路由，但部分设备查询、消息订阅具体 Path/字段仍保留为可替换适配层，详见 [docs/operations/placeholder-register.md](../operations/placeholder-register.md)。

