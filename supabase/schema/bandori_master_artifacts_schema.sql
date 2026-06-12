-- Canonical schema source for Bandori master artifact manifests.
-- hhwx-tracker writes these rows after publishing immutable artifacts.
-- hhwx API reads active pointers and bundle indexes from these tables.

CREATE TABLE IF NOT EXISTS public.master_artifact_versions (
    server text NOT NULL CHECK (server IN ('jp', 'cn', 'en', 'tw')),
    version text NOT NULL,
    client_version text,
    data_version text,
    master_version text,
    artifact_prefix text NOT NULL,
    manifest_path text NOT NULL,
    manifest jsonb NOT NULL,
    record_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
    checksums jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'published' CHECK (status IN ('building', 'published', 'failed', 'disabled')),
    built_at timestamptz NOT NULL,
    published_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (server, version)
);

CREATE TABLE IF NOT EXISTS public.master_active_versions (
    server text PRIMARY KEY CHECK (server IN ('jp', 'cn', 'en', 'tw')),
    version text NOT NULL,
    master_version text,
    artifact_prefix text NOT NULL,
    manifest_path text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (server, version)
        REFERENCES public.master_artifact_versions (server, version)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.bandori_master_api_index (
    server text NOT NULL CHECK (server IN ('jp', 'cn', 'en', 'tw')),
    version text NOT NULL,
    endpoint text NOT NULL,
    bundle_name text NOT NULL,
    artifact_path text NOT NULL,
    dataset_names jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (server, version, endpoint),
    FOREIGN KEY (server, version)
        REFERENCES public.master_artifact_versions (server, version)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_master_artifact_versions_master_version
ON public.master_artifact_versions (server, master_version);

CREATE INDEX IF NOT EXISTS idx_master_active_versions_server_version
ON public.master_active_versions (server, version);

CREATE INDEX IF NOT EXISTS idx_bandori_master_api_index_bundle
ON public.bandori_master_api_index (server, bundle_name);

ALTER TABLE public.master_artifact_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_active_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bandori_master_api_index ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_artifact_versions_select_all ON public.master_artifact_versions;
DROP POLICY IF EXISTS master_active_versions_select_all ON public.master_active_versions;
DROP POLICY IF EXISTS bandori_master_api_index_select_all ON public.bandori_master_api_index;

CREATE POLICY master_artifact_versions_select_all
ON public.master_artifact_versions
FOR SELECT
USING (true);

CREATE POLICY master_active_versions_select_all
ON public.master_active_versions
FOR SELECT
USING (true);

CREATE POLICY bandori_master_api_index_select_all
ON public.bandori_master_api_index
FOR SELECT
USING (true);

REVOKE ALL ON TABLE public.master_artifact_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.master_active_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bandori_master_api_index FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.master_artifact_versions TO anon, authenticated;
GRANT SELECT ON TABLE public.master_active_versions TO anon, authenticated;
GRANT SELECT ON TABLE public.bandori_master_api_index TO anon, authenticated;

GRANT ALL ON TABLE public.master_artifact_versions TO service_role;
GRANT ALL ON TABLE public.master_active_versions TO service_role;
GRANT ALL ON TABLE public.bandori_master_api_index TO service_role;
