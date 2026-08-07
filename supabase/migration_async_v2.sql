-- ============================================================
-- V2 异步事件驱动重构迁移脚本
-- 新增 7 张表 + shipments 增加去重键 line_no + 全部要求索引
-- 可在 Supabase SQL Editor 或 psql 中重复执行（幂等）
-- ============================================================

-- 现有通行表结构沿用 init.sql：parsing_rules、shipments

-- 给 shipments 增加幂等/去重用业务键列（幂等 UPSERT 用 external_code+sku_code+line_no）
-- 使用唯一索引，满足 Supabase upsert onConflict 要求
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS line_no INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_dedup
  ON shipments (external_code, sku_code, line_no);

CREATE INDEX IF NOT EXISTS idx_shipments_created_at_desc
  ON shipments (created_at DESC);

-- ============================================================
-- sku_master：SKU 主数据（压测与批量校验）
-- ============================================================
CREATE TABLE IF NOT EXISTS sku_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code TEXT NOT NULL UNIQUE,
  name TEXT,
  spec TEXT,
  unit TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE sku_master IS 'SKU 主数据，用于压测与批量校验';

CREATE OR REPLACE FUNCTION validate_sku_codes(p_sku_codes TEXT[])
RETURNS TABLE(sku_code TEXT)
LANGUAGE SQL
STABLE
AS $$
  SELECT s.sku_code
  FROM sku_master AS s
  WHERE s.sku_code = ANY(p_sku_codes);
$$;

-- ============================================================
-- import_tasks：导入任务主表
-- ============================================================
CREATE TABLE IF NOT EXISTS import_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_ref TEXT,
  rule_id TEXT,
  rule_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending/processing/completed/partial_success/failed
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  success_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  total_batches INTEGER NOT NULL DEFAULT 0,
  completed_batches INTEGER NOT NULL DEFAULT 0,
  batch_size INTEGER NOT NULL DEFAULT 1000,
  degraded BOOLEAN NOT NULL DEFAULT FALSE,
  degraded_note TEXT,
  trace_id TEXT,
  error_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_import_tasks_status_created ON import_tasks (status, created_at);
CREATE INDEX IF NOT EXISTS idx_import_tasks_task_id ON import_tasks (task_id);

COMMENT ON COLUMN import_tasks.degraded IS '是否发生 SKU 校验降级';

-- ============================================================
-- import_task_batches：处理单元状态表
-- ============================================================
CREATE TABLE IF NOT EXISTS import_task_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  start_row INTEGER NOT NULL,
  end_row INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending/processing/succeeded/failed
  retry_count INTEGER NOT NULL DEFAULT 0,
  rows_success INTEGER NOT NULL DEFAULT 0,
  rows_failed INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_task_unit
  ON import_task_batches (task_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_batches_task_status
  ON import_task_batches (task_id, status);

-- ============================================================
-- import_task_errors：行级错误明细
-- ============================================================
CREATE TABLE IF NOT EXISTS import_task_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  unit_id TEXT,
  batch_index INTEGER,
  row_number INTEGER NOT NULL,
  field_name TEXT,
  raw_value TEXT,
  error_code TEXT,
  error_reason TEXT,
  trace_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_errors_task_unit
  ON import_task_errors (task_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_errors_task_code
  ON import_task_errors (task_id, error_code);
CREATE INDEX IF NOT EXISTS idx_errors_task_row
  ON import_task_errors (task_id, row_number);

-- ============================================================
-- event_outbox：本地可靠事件表
-- ============================================================
CREATE TABLE IF NOT EXISTS event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending/sent/failed
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_retry
  ON event_outbox (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate
  ON event_outbox (aggregate_id);

-- ============================================================
-- event_queue：DB 轮询兜底队列（QUEUE_BACKEND=db 时使用）
-- 无 Redis 凭据时也能跑通本地全链路，后续切换 BullMQ 零改动
-- ============================================================
CREATE TABLE IF NOT EXISTS event_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL DEFAULT 'import-batches',
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',   -- queued/claimed/done
  retry_count INTEGER NOT NULL DEFAULT 0,
  trace_id TEXT,
  locked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  done_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_event_queue_claim
  ON event_queue (queue_name, status, locked_at);

-- ============================================================
-- batch_performance_log：处理单元性能日志
-- ============================================================
CREATE TABLE IF NOT EXISTS batch_performance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  unit_id TEXT,
  batch_index INTEGER,
  parse_duration_ms INTEGER,
  rule_duration_ms INTEGER,
  validate_duration_ms INTEGER,
  insert_duration_ms INTEGER,
  total_duration_ms INTEGER,
  rows_processed INTEGER,
  status TEXT,
  trace_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_task_unit
  ON batch_performance_log (task_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_perf_created
  ON batch_performance_log (created_at);

-- ============================================================
-- trace_events：链路时间线事件
-- ============================================================
CREATE TABLE IF NOT EXISTS trace_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id TEXT NOT NULL,
  task_id TEXT,
  unit_id TEXT,
  batch_index INTEGER,
  event_name TEXT NOT NULL,
  event_status TEXT,
  message TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trace_id_time
  ON trace_events (trace_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_trace_task
  ON trace_events (task_id);

-- ============================================================
-- RPC 函数：保证事务边界与原子更新（Supabase JS 无多语句事务，用 RPC 实现）
-- ============================================================

-- 1) create_import_task：任务 + 批次 + Outbox 事件 在同一数据库事务内完成（Transactional Outbox）
CREATE OR REPLACE FUNCTION create_import_task(
  p_task_id TEXT,
  p_file_name TEXT,
  p_file_ref TEXT,
  p_trace_id TEXT,
  p_rule JSONB,
  p_total_rows INTEGER,
  p_total_batches INTEGER,
  p_batch_size INTEGER,
  p_batches JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  b JSONB;
  payload JSONB;
  batch_payload JSONB;
BEGIN
  INSERT INTO import_tasks (task_id, file_name, file_ref, status, total_rows, total_batches, batch_size, trace_id)
  VALUES (p_task_id, p_file_name, p_file_ref, 'pending', p_total_rows, p_total_batches, p_batch_size, p_trace_id);

  FOR b IN SELECT * FROM jsonb_array_elements(p_batches) LOOP
    INSERT INTO import_task_batches (task_id, unit_id, batch_index, start_row, end_row, status)
    VALUES (
      p_task_id,
      b->>'unit_id',
      (b->>'batch_index')::int,
      (b->>'start_row')::int,
      (b->>'end_row')::int,
      'pending'
    );

    batch_payload := jsonb_build_object(
      'task_id', p_task_id,
      'unit_id', b->>'unit_id',
      'batch_index', (b->>'batch_index')::int,
      'start_row', (b->>'start_row')::int,
      'end_row', (b->>'end_row')::int,
      'file_ref', p_file_ref,
      'file_name', p_file_name,
      'rule', p_rule,
      'trace_id', p_trace_id
    );

    INSERT INTO event_outbox (aggregate_id, event_type, payload, status)
    VALUES (p_task_id, 'ImportBatchCreated', batch_payload, 'pending');
  END LOOP;

  payload := jsonb_build_object(
    'task_id', p_task_id,
    'file_name', p_file_name,
    'total_rows', p_total_rows,
    'total_batches', p_total_batches,
    'batch_size', p_batch_size,
    'trace_id', p_trace_id
  );

  INSERT INTO event_outbox (aggregate_id, event_type, payload, status)
  VALUES (p_task_id, 'ImportTaskCreated', payload, 'pending');

  RETURN jsonb_build_object(
    'task_id', p_task_id,
    'status', 'pending',
    'total_rows', p_total_rows,
    'total_batches', p_total_batches
  );
END;
$$;

-- 1.1) create_import_task_fast：上传快路径。
-- 上传请求只保存文件并创建空任务，一次 RPC 内写入规划事件；行数统计和批次创建由 Worker 异步完成。
CREATE OR REPLACE FUNCTION create_import_task_fast(
  p_task_id TEXT,
  p_file_name TEXT,
  p_file_ref TEXT,
  p_trace_id TEXT,
  p_rule JSONB,
  p_batch_size INTEGER DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  payload JSONB;
BEGIN
  INSERT INTO import_tasks (task_id, file_name, file_ref, status, total_rows, total_batches, batch_size, trace_id)
  VALUES (p_task_id, p_file_name, p_file_ref, 'pending', 0, 0, p_batch_size, p_trace_id);

  payload := jsonb_build_object(
    'task_id', p_task_id,
    'file_ref', p_file_ref,
    'file_name', p_file_name,
    'rule', p_rule,
    'trace_id', p_trace_id,
    'batch_size', p_batch_size
  );

  INSERT INTO event_queue (queue_name, event_type, payload, trace_id, status)
  VALUES ('import-batches', 'ImportTaskCreated', payload, p_trace_id, 'queued');

  INSERT INTO event_outbox (aggregate_id, event_type, payload, status)
  VALUES (p_task_id, 'ImportTaskCreated', payload, 'sent');

  INSERT INTO trace_events (trace_id, task_id, event_name, event_status, message)
  VALUES (p_trace_id, p_task_id, 'ImportTaskCreated', 'ok', 'Import task created and planning event queued.');

  RETURN jsonb_build_object(
    'task_id', p_task_id,
    'trace_id', p_trace_id,
    'status', 'pending',
    'total_rows', 0,
    'total_batches', 0,
    'batch_size', p_batch_size
  );
END;
$$;

-- 2) claim_batch：处理单元 CAS 认领，防止重复消费；支持超时卡死批次重认领
CREATE OR REPLACE FUNCTION claim_batch(
  p_task_id TEXT,
  p_unit_id TEXT,
  p_lock_timeout_minutes INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  row_data import_task_batches%ROWTYPE;
BEGIN
  SELECT * INTO row_data
  FROM import_task_batches
  WHERE task_id = p_task_id AND unit_id = p_unit_id
    AND (
      status = 'pending'
      OR (status = 'processing' AND locked_at < now() - make_interval(mins => p_lock_timeout_minutes))
    )
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE import_task_batches
  SET status = 'processing',
      locked_at = now(),
      retry_count = retry_count + 1
  WHERE task_id = p_task_id AND unit_id = p_unit_id;

  RETURN jsonb_build_object(
    'task_id', row_data.task_id,
    'unit_id', row_data.unit_id,
    'batch_index', row_data.batch_index,
    'start_row', row_data.start_row,
    'end_row', row_data.end_row,
    'retry_count', row_data.retry_count + 1
  );
END;
$$;

-- 3) complete_batch：写批次结果并原子重算任务聚合进度（从批次账本推导，天然防重复累计）
CREATE OR REPLACE FUNCTION complete_batch(
  p_task_id TEXT,
  p_unit_id TEXT,
  p_status TEXT,
  p_rows_success INTEGER DEFAULT 0,
  p_rows_failed INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  agg RECORD;
  final_status TEXT;
BEGIN
  UPDATE import_task_batches
  SET status = p_status,
      rows_success = p_rows_success,
      rows_failed = p_rows_failed,
      completed_at = now()
  WHERE task_id = p_task_id AND unit_id = p_unit_id;

  SELECT
    COUNT(*) FILTER (WHERE status IN ('succeeded','failed')) AS done,
    COUNT(*) AS total,
    COALESCE(SUM(rows_success + rows_failed), 0) AS processed,
    COALESCE(SUM(rows_success), 0) AS success,
    COALESCE(SUM(rows_failed), 0) AS failed,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_batches
  INTO agg
  FROM import_task_batches
  WHERE task_id = p_task_id;

  IF agg.total IS NOT NULL AND agg.done >= agg.total AND agg.total > 0 THEN
    IF agg.failed_batches >= agg.total THEN
      final_status := 'failed';
    ELSIF agg.failed > 0 THEN
      final_status := 'partial_success';
    ELSE
      final_status := 'completed';
    END IF;
  ELSE
    final_status := 'processing';
  END IF;

  UPDATE import_tasks AS t
  SET processed_rows = agg.processed,
      success_rows = agg.success,
      failed_rows = agg.failed,
      completed_batches = agg.done,
      status = final_status,
      completed_at = CASE WHEN final_status IN ('completed','partial_success','failed') THEN now() ELSE t.completed_at END
  WHERE t.task_id = p_task_id;

  RETURN jsonb_build_object(
    'task_id', p_task_id,
    'status', final_status,
    'processed_rows', agg.processed,
    'success_rows', agg.success,
    'failed_rows', agg.failed,
    'completed_batches', agg.done
  );
END;
$$;

-- 4) mark_task_degraded：记录 SKU 校验降级状态
CREATE OR REPLACE FUNCTION mark_task_degraded(
  p_task_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE import_tasks
  SET degraded = TRUE,
      degraded_note = COALESCE(p_reason, degraded_note)
  WHERE task_id = p_task_id;
END;
$$;

-- 5) recover_stale_batches：卡死批次恢复（超时未完成的 processing -> pending）
CREATE OR REPLACE FUNCTION recover_stale_batches(p_lock_timeout_minutes INTEGER DEFAULT 5)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE import_task_batches
  SET status = 'pending', locked_at = NULL
  WHERE status = 'processing'
    AND locked_at < now() - make_interval(mins => p_lock_timeout_minutes);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
