CREATE INDEX IF NOT EXISTS idx_master_active_versions_server_version
ON public.master_active_versions (server, version);
