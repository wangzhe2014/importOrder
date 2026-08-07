# 鲸天万能导入系统

基于 Next.js 14 + Supabase 的智能多格式批量下单系统。当前版本按 `考试要求-文件版本.html` 重构为“先抽取文件结构，再选择/生成解析规则，再预览校验，最后提交入库”的规则引擎流程，UI 风格参考鲸天系统。

## 核心能力

- 支持 Excel、Word、PDF 文件上传与结构抽取。
- 支持标准表格、矩阵转置、卡片式、自由文本等规则解析。
- 支持规则中心管理：新建、编辑、复制、删除规则，并提供常用配置可视化编辑 + JSON 高级编辑。
- 支持预览页行内编辑、增删行、导出 Excel、必填/电话/数量校验。
- 支持外部编码重复校验：本批次重复 + 数据库已有运单重复。
- 支持提交失败原因展示，重试时会重新显示提交进度动画。

## 技术栈

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- SheetJS / pdf-parse / pdf2json / mammoth
- Supabase

## 本地运行

```bash
npm install
npm run dev
```

默认访问：

```text
http://localhost:3000
```

如需指定端口：

```bash
npm run dev -- -p 3001
```

## 环境变量

在 `.env.local` 中配置：

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

如启用 AI 规则生成，可继续配置：

```env
LLM_API_KEY=your_llm_api_key
LLM_BASE_URL=your_llm_base_url
LLM_MODEL=your_model
```

不要把真实密钥提交到仓库。

## 数据库

初始化 SQL 位于：

```text
supabase/init.sql
```

主要业务表为 `shipments`。系统会优先按 V2 字段写入；如历史库仍是 V1 字段，后端保留兼容写入逻辑。

## 规则与样本验证

内置规则文件：

```text
saved_rules.json
```

有样本文件时，可启动本地服务后运行：

```bash
node test-parse-all.mjs
```

该脚本会对样本文件尝试同类型规则，选择有效解析结果最多的规则。

## 常用检查

```bash
npx tsc --noEmit
npm run build
```

在当前 Codex 沙箱中，`next build` 可能因系统权限出现 `spawn EPERM`，需要提升权限执行；正常本机终端通常直接运行即可。

## 主要目录

- `src/app/page.tsx`：主工作台、上传/规则/预览/提交流程。
- `src/components/RuleCenter.tsx`：规则中心页面。
- `src/components/DataPreview.tsx`：解析结果预览与编辑。
- `src/components/ResultModal.tsx`：提交结果与失败原因。
- `src/utils/ruleEngine.ts`：规则解析引擎。
- `src/utils/validator.ts`：预览校验与重复检测。
- `src/app/api/shipments/route.ts`：运单查询、重复校验、提交入库 API。
- `src/app/api/rules/route.ts`：规则 CRUD API。

## 异步导入运行

异步主链路使用 `POST /api/import-tasks` 创建任务，Worker 在独立进程中消费批次。数据库迁移位于 `supabase/migration_async_v2.sql`，执行一次后再启动应用。

服务端环境变量：

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
QUEUE_BACKEND=auto
UPSTASH_REDIS_URL=rediss://default:password@host:6379
IMPORT_BATCH_SIZE=1000
WORKER_CONCURRENCY=2
SKU_CHECK_TIMEOUT_MS=3000
IMPORT_TASK_CACHE_TTL_MS=1800000
IMPORT_TASK_CACHE_MAX_ENTRIES=4
UPLOAD_STORAGE_BACKEND=supabase
SUPABASE_STORAGE_BUCKET=import-files
```

生产推荐配置 `QUEUE_BACKEND=bullmq` 并提供 Upstash Redis URL。没有 Redis 时可设为 `QUEUE_BACKEND=db`，通过 PostgreSQL `event_queue` 运行兜底队列。`SUPABASE_SERVICE_ROLE_KEY` 只能作为服务端环境变量，不能使用 `NEXT_PUBLIC_` 前缀。

## 生产部署与验收

### 1. 初始化 Supabase

在 Supabase SQL Editor 按以下顺序执行：

```text
supabase/init.sql
supabase/migration_async_v2.sql
supabase/storage_import_files.sql
```

最后一个脚本创建私有 `import-files` bucket。Web 服务和 Worker 必须使用同一个 Supabase 项目、同一个 bucket，并都配置 `SUPABASE_SERVICE_ROLE_KEY`，这样 Worker 才能读取上传的原始文件。

任务规划阶段会在同一个 bucket 写入 `${task_id}/_planned.json.gz` 中间产物。它包含按 `unit_id` 切好的解析结果和任务级 SKU 校验输入；批次优先复用 Worker 内存缓存或该中间产物，不会重复下载和重复解析原始 Excel。原始上传文件仍会保留，用于缓存失效后的恢复和审计。

SKU 校验优先使用 `validate_sku_codes` RPC 一次完成。若该函数尚未执行迁移，Worker 会自动退回并发分块查询，避免因部署顺序导致整任务降级。

### 2. 部署 Web 服务

将 Next.js 应用部署至 Vercel 或其他 Node.js 平台。构建命令为：

```bash
npm ci
npm run build
```

为 Web 服务配置上面的全部环境变量。生产环境必须使用：

```env
UPLOAD_STORAGE_BACKEND=supabase
SUPABASE_STORAGE_BUCKET=import-files
```

### 3. 部署独立 Worker

Worker 不能部署在 Vercel Serverless Function 中。使用 Railway、Render、Fly.io、容器服务或常驻虚拟机部署同一提交版本，并配置与 Web 服务完全一致的 Supabase、队列和 Storage 环境变量。

```bash
npm ci
npm run worker
```

Worker 同时负责投递 Outbox、消费导入任务和恢复超时批次。Web 服务发布成功但 Worker 未运行时，任务会停留在 `pending`。

`IMPORT_TASK_CACHE_TTL_MS` 和 `IMPORT_TASK_CACHE_MAX_ENTRIES` 控制 Worker 内存缓存的过期时间和任务数量上限。缓存只用于性能优化，不是任务数据的唯一来源；Worker 重启后会从 `_planned.json.gz` 恢复。

### 4. 验收清单

1. 访问 Web URL，上传一个有效 Excel 文件，接口应立即返回 `task_id` 和 `trace_id`。
2. 在 Supabase Storage 的 `import-files` bucket 确认存在上传对象。
3. 在任务页面或导入监控确认状态从 `pending` 变为 `processing`，再进入 `succeeded` 或 `partial_success`。
4. 在 Trace 检索页面用 `trace_id` 检查 `ImportTaskCreated`、`ImportTaskPlanned`、`ImportBatchStarted` 和结束事件。
5. 导出错误明细，确认包含行号、字段、脱敏原值、错误码和英文错误原因。
6. 执行 `npm run seed` 和 `npm run loadtest`，将实际结果写入 `压测报告.md`。

异步页面：

- `/monitor`：导入监控
- `/traces`：Trace 检索
- `/import/:taskId`：任务进度和错误明细

压测数据和脚本：

```bash
npm run seed
npm run loadtest
```

设计说明、接口文档和压测记录分别见 `重构假设说明.md`、`接口文档.md`、`压测报告.md`。压测报告必须填写真实运行结果，不能将理论推导当作验收数据。
