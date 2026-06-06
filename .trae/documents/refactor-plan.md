# 重构方案：按「考试要求-文件版本.html」对齐

---

## 一、现状分析总结

### 已完成项（与需求匹配）
| 需求 | 当前状态 |
|------|----------|
| Next.js App Router + TypeScript | ✅ 已完成 |
| Supabase 数据库集成 | ✅ 已完成 |
| 四种结构类型规则引擎 (standard/matrix/card/free_text) | ✅ 已完成 |
| AI 规则生成 (DeepSeek LLM) | ✅ 已完成 |
| 文件上传 (Excel/Word/PDF，拖拽+点击) | ✅ 已完成 |
| 数据预览（虚拟滚动） | ✅ 已完成 |
| 数据校验（必填/A组B组二选一/电话/数量/重复） | ✅ 已完成 |
| 规则 CRUD 持久化（Supabase + 本地JSON双存） | ✅ 已完成 |
| 运单列表（搜索+分页） | ✅ 已完成 |
| 鲸天系统 UI 风格（#0fc6c2 主色） | ✅ 已完成 |
| 导出 Excel | ✅ 已完成 |
| 解析进度条 | ✅ 已完成 |
| 移动端响应式适配 | ✅ 已完成 |

### 当前 demos 目录文件（6个）
- `12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx` - 标准表格 + 尾部信息提取
- `湖南仓.xlsx` - 标准表格 + 跨行聚合
- `欢乐牧场模板0430.xlsx` - 矩阵转置
- `黔寨寨贵州烙锅（鞍山店）常温.pdf` - PDF 多页解析
- `多门店分Sheet出库单.xlsx` - 多Sheet合并 + 尾部信息
- `门店调拨单-卡片式.xlsx` - 卡片式

### 关键缺陷
1. **缺少跨行聚合（跨行聚合）**：规则引擎不为同一个外部编码的多行共享收货人信息——`湖南仓.xlsx` 类型文件会出错
2. `executeParse` 中有一个人工的 `setTimeout(500)` 延迟——违反了 1000条10秒的性能要求
3. Toast 通知系统缺失——需求要求有成功/失败Toast提示
4. 缺少按钮防重复点击——提交时可能重复触发
5. 缺少规则配置的可视化编辑器——目前仅有JSON编辑框，无法对单个字段进行编辑（如列映射下拉选择、坐标点选等）
6. 缺少规则"使用此规则解析"后自动保存到规则列表的功能
7. demos 目前仅有 6 个文件——需求提及的 9 个文件中缺少：周配送计划、门店配送确认单(Word)、配送签收单(多单PDF)

---

## 二、重构内容

### 阶段 1：规则引擎增强——跨行聚合

**文件**：`src/utils/ruleEngine.ts`

**改动**：
- 在 `ParsingConfig` 中新增 `aggregation_field?: string` 配置项——指定按哪个字段聚合（如 `external_code`）
- 在 `parseExcelWithRule` 的 `standard` 模式中，当 `config.aggregation_field` 被设置时：
  1. 先按标准模式逐行解析所有数据
  2. 按聚合字段分组，同一组的行共享非空的收货人信息（后一行覆盖前一行的空值）
  3. 聚合后返回扁平化结果
- 在 `ParsingConfig` 中新增 `aggregation_receiver_source_rows?: number[]` —— 指定从哪几行取收货人信息（0-based 相对行号），用于湖南仓场景中仅在特定行有收货人信息

**文件**：`src/types/index.ts`

**改动**：
- 在 `ParsingConfig` 接口中新增：
  ```typescript
  // 跨行聚合配置
  aggregation_field?: string  // 聚合字段名，如 'external_code'
  aggregation_receiver_source_rows?: number[]  // 收货信息来源行（0-based 相对 data_start 的偏移）
  ```

---

### 阶段 2：UI/UX 改进

#### 2.1 Toast 通知系统

**新建文件**：`src/components/Toast.tsx`

**内容**：
- 轻量级 Toast 组件，支持 success / error / info 三种类型
- 自动 3 秒消失 + 手动关闭
- 从右下角弹出动画
- 使用 React Context 或 props 传递

**修改文件**：`src/app/page.tsx`
- 在提交成功时显示 Toast "提交成功，共 N 条"
- 在提交失败时显示 Toast "提交失败，请重试"
- 在解析失败时显示 Toast "文件解析失败：错误原因"

**修改文件**：`src/components/RuleManager.tsx`
- 规则保存成功时 Toast "规则保存成功"
- 规则删除成功时 Toast "规则已删除"

#### 2.2 按钮防重复点击

**修改文件**：
- `src/app/page.tsx` — `handleSubmit` 添加 `submitting` 状态锁，disabled 时阻止重复点击
- `src/components/RuleManager.tsx` — AI 生成按钮、保存按钮、删除按钮添加 loading/disabled 状态
- `src/components/DataPreview.tsx` — 提交按钮已有 `disabled={hasErrors}`，加一个 `submitting` 锁

#### 2.3 空状态占位图

**修改文件**：
- `src/components/ShipmentList.tsx` — 无数据时显示一个更友好的空状态（图标 + 引导文案）
- `src/components/RuleManager.tsx` — 无规则时已有占位图，保持不变

#### 2.4 移除人工延迟

**修改文件**：`src/app/page.tsx`
- 删除 `executeParse` 中的 `setTimeout(500)`，改为直接同步执行

---

### 阶段 3：性能对齐

#### 3.1 移除 setTimeout

**修改文件**：`src/app/page.tsx`
- `executeParse` 去除 `setTimeout(500)` 包裹，直接同步调用解析函数
- 虚拟滚动已在 `DataPreview` 中实现（ROW_HEIGHT=41, BUFFER_ROWS=20），可支持 1000+ 条数据

#### 3.2 大数据量导入进度

**修改文件**：`src/app/page.tsx`
- `handleSubmit` 改为批量提交时按批次更新 `uploadProgress`
- 当前逐条插入数据库，可改为每 50 条一批更新进度条

---

### 阶段 4：解析失败处理改进

**修改文件**：
- `src/app/page.tsx` — 当解析规则执行后返回空结果时，显示明确提示："当前规则未解析出任何数据，请检查规则配置或手动调整规则"
- `src/components/RuleManager.tsx` — 试解析结果为空时，已有提示 "解析结果为空，请检查规则配置"，保持不变

**修改文件**：`src/app/api/parse-file/route.ts`
- 当 PDF 解析结果为空时，返回更明确的错误信息

---

### 阶段 5：Vercel 部署配置

**新建文件**：`vercel.json`（如需要）
```json
{
  "buildCommand": "next build",
  "installCommand": "npm install"
}
```

**验证**：确认 `next.config.js` 对 Vercel 兼容，当前配置正确。

---

### 阶段 6：规则配置可视化编辑（可选增强）

**修改文件**：`src/components/RuleManager.tsx`

**改动**：
- 在"新建规则"弹窗中，AI 生成规则后，除了名称和结构类型外，增加一个 **字段映射可视化表格**
- 表格两列：目标字段（固定）| 源列名（可编辑下拉）
- 可编辑字段：header_row_index, data_start_row_index, data_end_marker
- 高级配置（meta_extractors 等）仍保留 JSON 编辑入口

---

### 阶段 7：清理冗余代码

**删除/简化**：
- `src/utils/excelParser.ts` 中的 `autoDetectMappings` 引用（该功能已迁移到规则引擎）
- `src/types/index.ts` 中 V1 兼容属性可标记 `@deprecated`
- `src/utils/templateMatcher.ts` — 评估是否仍被使用，如无引用可删除

---

## 三、文件变更清单

| 文件 | 操作类型 | 简要说明 |
|------|----------|----------|
| `src/types/index.ts` | 修改 | 增加 `aggregation_field`、`aggregation_receiver_source_rows` 配置 |
| `src/utils/ruleEngine.ts` | 修改 | 实现跨行聚合逻辑 |
| `src/components/Toast.tsx` | **新建** | Toast 通知组件 |
| `src/app/page.tsx` | 修改 | 移除 setTimeout(500)；集成 Toast；按钮防重复；解析失败处理 |
| `src/components/RuleManager.tsx` | 修改 | 增加字段映射可视化；Toast 通知；按钮防重复 |
| `src/components/DataPreview.tsx` | 修改 | 提交按钮防重复 |
| `src/components/ShipmentList.tsx` | 修改 | 空状态占位图优化 |
| `src/utils/templateMatcher.ts` | 删除 | 功能已被规则引擎替代 |
| `vercel.json` | 可选新建 | Vercel 部署配置 |

---

## 四、验证方案

1. **跨行聚合验证**：用 `湖南仓.xlsx` 测试，确认同一配送单号的多行 SKU 共享收货人信息
2. **Toast 验证**：提交成功/失败时右下角弹出 Toast 并自动消失
3. **防重复验证**：快速双击提交按钮，确认只触发一次
4. **空状态验证**：运单列表无数据时显示空状态
5. **性能验证**：1000 条数据预览，确认虚拟滚动流畅无卡顿
6. **构建验证**：`npm run build` 无错误
7. **类型检查**：`npm run lint` 通过
