-- Supabase Storage 初始化：生产原始导入文件使用私有 bucket。
-- 使用 service_role 访问，不需要公开 bucket。
INSERT INTO storage.buckets (id, name, public)
VALUES ('import-files', 'import-files', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
