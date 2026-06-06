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
