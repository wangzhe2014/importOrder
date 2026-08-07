# 202607 交付产物

本目录保存本次专项考核的压测交付文件：

- `10000-orders.xlsx`：表头 1 行，运单数据 10000 行；包含少量非法 SKU，用于验证 E001 错误定位。
- `10000-orders.manifest.json`：文件行数、字段和非法 SKU 位置清单。

重新生成：

```bash
npx tsx scripts/generate-load-file.ts
```

SKU 主数据灌入脚本仍为 `scripts/seed-data.ts`，默认生成 `SKU_00001` 至 `SKU_20000`。
