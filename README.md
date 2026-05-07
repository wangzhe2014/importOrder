# 物流批量下单系统

基于 Next.js + Supabase 的物流批量下单Web应用，支持多种Excel模板自动识别与导入。

## 功能特性

### 模块一：模板管理与文件导入
- 支持上传 Excel 文件（.xlsx / .xls），支持拖拽上传和点击上传
- 支持多种不同模板格式的自动识别（不同列名、不同列序）
- 模板记忆学习：自动记录列映射规则，下次上传相同结构模板时自动应用
- 实时进度条显示导入进度
- 支持1000条以上数据导入
- 完善的错误处理

### 模块二：数据预览与编辑
- 类Excel表格形式展示数据
- 表头固定、支持横向滚动、单元格点击可直接编辑
- 行内错误实时校验：必填字段缺失、电话格式错误、重量/件数非正数等
- 全部错误一次性展示
- 外部编码重复检测
- 支持删除行、新增空行操作
- 支持导出Excel文件

### 模块三：提交下单
- 有错误的行不允许提交
- 点击提交后显示上传进度条
- 提交成功后数据持久化到数据库
- 返回提交结果汇总

### 模块四：已导入运单列表
- 查看所有历史已导入的运单记录
- 支持按外部编码、收件人姓名、提交时间进行筛选/搜索
- 支持分页展示

## 技术栈

- **前端框架**: Next.js 14
- **UI样式**: Tailwind CSS 3
- **图标库**: Lucide React
- **Excel处理**: SheetJS (xlsx)
- **数据库**: Supabase
- **部署**: Vercel

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:3000 查看应用。

### 构建生产版本

```bash
npm run build
```

### 启动生产服务器

```bash
npm run start
```

## 环境变量配置

在 `.env.local` 文件中配置以下环境变量：

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 数据库表结构

需要在 Supabase 中创建 `shipments` 表：

```sql
CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_code TEXT,
  sender_name TEXT NOT NULL,
  sender_phone TEXT NOT NULL,
  sender_address TEXT NOT NULL,
  receiver_name TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  weight NUMERIC NOT NULL,
  quantity INTEGER NOT NULL,
  temperature TEXT NOT NULL,
  remark TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 部署到 Vercel

1. 安装 Vercel CLI：
```bash
npm install -g vercel
```

2. 登录 Vercel：
```bash
vercel login
```

3. 部署项目：
```bash
vercel
```

按照提示完成部署配置，确保在 Vercel 中配置好环境变量。

## 导入字段说明

| 字段名 | 说明 | 必填 |
|--------|------|------|
| 外部编码 | 外部系统订单唯一编号，用于去重 | 否 |
| 发件人姓名 | 寄件人姓名 | 是 |
| 发件人电话 | 寄件人联系方式 | 是 |
| 发件人地址 | 寄件人完整地址 | 是 |
| 收件人姓名 | 收货人姓名 | 是 |
| 收件人电话 | 收货人联系方式 | 是 |
| 收件人地址 | 收货人完整地址 | 是 |
| 重量(kg) | 货物重量，必须为正数 | 是 |
| 件数 | 包裹数量，必须为正整数 | 是 |
| 温层 | 常温/冷藏/冷冻 | 是 |
| 备注 | 附加说明 | 否 |
