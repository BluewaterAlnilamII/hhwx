-- 运维脚本，不是 schema migration；不要把它作为建库 SQL 执行。
-- 注意：Supabase SQL Editor 会将整段脚本放进事务块中执行，
-- 因此 VACUUM / VACUUM FULL 不能直接在 SQL Editor 里运行。
-- 这个文件只保留 SQL Editor 可执行的观测与轻量维护语句。
-- 若需要 VACUUM / VACUUM FULL，请改用 psql、DBeaver、pgAdmin 等直连客户端，
-- 并确保 autocommit 打开。

-- 观测当前表大小与死元组，先确认膨胀是否主要来自 bandori_tracker_data。
SELECT
    relname AS table_name,
    n_live_tup,
    n_dead_tup,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname = 'bandori_tracker_data';

SELECT
    pg_size_pretty(pg_relation_size('public.bandori_tracker_data')) AS heap_size,
    pg_size_pretty(pg_indexes_size('public.bandori_tracker_data')) AS index_size,
    pg_size_pretty(pg_total_relation_size('public.bandori_tracker_data')) AS total_size;

-- 更新统计信息。该语句可在 SQL Editor 中执行。
ANALYZE public.bandori_tracker_data;

-- 再看一次大小与统计信息。
SELECT
    relname AS table_name,
    n_live_tup,
    n_dead_tup,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname = 'bandori_tracker_data';

SELECT
    pg_size_pretty(pg_relation_size('public.bandori_tracker_data')) AS heap_size,
    pg_size_pretty(pg_indexes_size('public.bandori_tracker_data')) AS index_size,
    pg_size_pretty(pg_total_relation_size('public.bandori_tracker_data')) AS total_size;

-- 可选：如果 index_size 异常偏大，而 heap_size 本身不大，
-- 可以在 SQL Editor 里尝试重建现有索引。
-- 注意：REINDEX 只会重建“现有索引”，不会删除多余索引，也不会回收表本体的膨胀空间。
-- REINDEX TABLE public.bandori_tracker_data;

-- 外部客户端中可执行的回收语句示例：
-- VACUUM (ANALYZE) public.bandori_tracker_data;
-- VACUUM FULL public.bandori_tracker_data;
-- ANALYZE public.bandori_tracker_data;
