BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(1);

DO $$
BEGIN
    IF has_table_privilege('anon', 'public.bandori_tracker_topdata_latest_snapshots', 'SELECT') THEN
        RAISE EXCEPTION 'anon must not read topdata latest snapshots';
    END IF;
    IF has_table_privilege('anon', 'public.bandori_tracker_topdata_latest_snapshots', 'INSERT')
       OR has_table_privilege('anon', 'public.bandori_tracker_topdata_latest_snapshots', 'UPDATE')
       OR has_table_privilege('anon', 'public.bandori_tracker_topdata_latest_snapshots', 'DELETE') THEN
        RAISE EXCEPTION 'anon must not mutate topdata latest snapshots';
    END IF;
    IF NOT has_table_privilege(
        'authenticated',
        'public.bandori_tracker_topdata_latest_snapshots',
        'SELECT'
    ) THEN
        RAISE EXCEPTION 'authenticated must read topdata latest snapshots';
    END IF;
    IF has_table_privilege(
        'authenticated',
        'public.bandori_tracker_topdata_latest_snapshots',
        'INSERT'
    ) OR has_table_privilege(
        'authenticated',
        'public.bandori_tracker_topdata_latest_snapshots',
        'UPDATE'
    ) OR has_table_privilege(
        'authenticated',
        'public.bandori_tracker_topdata_latest_snapshots',
        'DELETE'
    ) THEN
        RAISE EXCEPTION 'authenticated must not mutate topdata latest snapshots';
    END IF;
    IF has_function_privilege(
        'authenticated',
        'public.upsert_bandori_tracker_topdata_latest(text,integer,text,bigint,jsonb)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'authenticated must not execute topdata latest RPC';
    END IF;
    IF has_function_privilege(
        'anon',
        'public.upsert_bandori_tracker_topdata_latest(text,integer,text,bigint,jsonb)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'anon must not execute topdata latest RPC';
    END IF;
    IF NOT has_function_privilege(
        'service_role',
        'public.upsert_bandori_tracker_topdata_latest(text,integer,text,bigint,jsonb)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'service_role must execute topdata latest RPC';
    END IF;
    IF NOT has_table_privilege(
        'service_role',
        'public.bandori_tracker_topdata_latest_snapshots',
        'SELECT'
    ) OR NOT has_table_privilege(
        'service_role',
        'public.bandori_tracker_topdata_latest_snapshots',
        'INSERT'
    ) OR NOT has_table_privilege(
        'service_role',
        'public.bandori_tracker_topdata_latest_snapshots',
        'UPDATE'
    ) OR has_table_privilege(
        'service_role',
        'public.bandori_tracker_topdata_latest_snapshots',
        'DELETE'
    ) THEN
        RAISE EXCEPTION 'service_role topdata latest privileges are not minimal';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'bandori_tracker_topdata_latest_snapshots'
          AND policyname = 'bandori_tracker_topdata_latest_select_authenticated'
          AND cmd = 'SELECT'
          AND 'authenticated' = ANY (roles)
    ) THEN
        RAISE EXCEPTION 'topdata latest authenticated SELECT policy is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'realtime'
          AND tablename = 'messages'
          AND policyname = 'bandori_topdata_private_broadcast_select'
          AND cmd = 'SELECT'
          AND 'authenticated' = ANY (roles)
    ) THEN
        RAISE EXCEPTION 'topdata Private Broadcast SELECT policy is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'realtime'
          AND tablename = 'messages'
          AND policyname = 'bandori_topdata_private_broadcast_select'
          AND position('^bandori:topdata:cn:events:[1-9][0-9]*$' in qual) > 0
          AND position('broadcast' in qual) > 0
    ) THEN
        RAISE EXCEPTION 'topdata Private Broadcast policy is not anchored to the CN event topic';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'realtime'
          AND tablename = 'messages'
          AND cmd IN ('INSERT', 'ALL')
          AND roles && ARRAY['public', 'authenticated']::name[]
    ) THEN
        RAISE EXCEPTION 'authenticated browsers must not have Broadcast INSERT policy';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'bandori_tracker_topdata_latest_snapshots'
    ) THEN
        RAISE EXCEPTION 'topdata latest table must not use Postgres Changes';
    END IF;
END;
$$;

CREATE EXTENSION IF NOT EXISTS dblink;

DO $$
DECLARE
    connection_string text := format(
        'hostaddr=%s port=%s dbname=%I user=postgres password=postgres',
        coalesce(host(inet_server_addr()), '127.0.0.1'),
        current_setting('port'),
        current_database()
    );
    older_query text;
    newer_query text;
    older_status text;
    newer_status text;
    ignored_revision bigint;
    final_revision bigint;
    final_observed_at bigint;
BEGIN
    older_query := $query$
        WITH sample AS (
            SELECT jsonb_build_object(
                'points', jsonb_agg(jsonb_build_object(
                    'time', 2100000000000::bigint,
                    'uid', 300000 + position,
                    'value', 1000000 - position
                ) ORDER BY position),
                'users', jsonb_agg(jsonb_build_object(
                    'uid', 300000 + position,
                    'name', 'user-' || position,
                    'introduction', '',
                    'rank', 100 + position,
                    'sid', 0,
                    'strained', 0,
                    'degrees', '[]'::jsonb
                ) ORDER BY position)
            ) AS payload
            FROM generate_series(1, 10) AS positions(position)
        )
        SELECT status, revision
        FROM sample, LATERAL public.upsert_bandori_tracker_topdata_latest(
            'cn', 987654330,
            'cn:topdata:events:987654330:2100000000000',
            2100000000000,
            sample.payload
        )
    $query$;
    newer_query := replace(older_query, '2100000000000', '2100000001000');

    PERFORM dblink_exec(
        connection_string,
        'DELETE FROM public.bandori_tracker_topdata_latest_snapshots '
        'WHERE server = ''cn'' AND event_id = 987654330'
    );
    BEGIN
        PERFORM dblink_connect('topdata_concurrent_older', connection_string);
        PERFORM dblink_connect('topdata_concurrent_newer', connection_string);
        PERFORM dblink_send_query('topdata_concurrent_older', older_query);
        PERFORM dblink_send_query('topdata_concurrent_newer', newer_query);

    SELECT status, revision INTO older_status, ignored_revision
    FROM dblink_get_result('topdata_concurrent_older') AS result(status text, revision bigint);
    SELECT status, revision INTO newer_status, ignored_revision
    FROM dblink_get_result('topdata_concurrent_newer') AS result(status text, revision bigint);
    PERFORM 1
    FROM dblink_get_result('topdata_concurrent_older') AS result(status text, revision bigint);
    PERFORM 1
    FROM dblink_get_result('topdata_concurrent_newer') AS result(status text, revision bigint);

    SELECT revision, observed_at
    INTO final_revision, final_observed_at
    FROM public.bandori_tracker_topdata_latest_snapshots
    WHERE server = 'cn' AND event_id = 987654330;

    IF newer_status <> 'written'
       OR older_status NOT IN ('written', 'stale')
       OR final_observed_at <> 2100000001000
       OR final_revision NOT IN (1, 2) THEN
        RAISE EXCEPTION
            'concurrent topdata revision failed: older=%, newer=%, revision=%, observed_at=%',
            older_status, newer_status, final_revision, final_observed_at;
    END IF;

        PERFORM dblink_exec(
            'topdata_concurrent_older',
            'DELETE FROM public.bandori_tracker_topdata_latest_snapshots '
            'WHERE server = ''cn'' AND event_id = 987654330'
        );
        PERFORM dblink_disconnect('topdata_concurrent_older');
        PERFORM dblink_disconnect('topdata_concurrent_newer');
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            IF 'topdata_concurrent_older' = ANY (
                COALESCE(dblink_get_connections(), ARRAY[]::text[])
            ) THEN
                PERFORM dblink_disconnect('topdata_concurrent_older');
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        BEGIN
            IF 'topdata_concurrent_newer' = ANY (
                COALESCE(dblink_get_connections(), ARRAY[]::text[])
            ) THEN
                PERFORM dblink_disconnect('topdata_concurrent_newer');
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        PERFORM dblink_exec(
            connection_string,
            'DELETE FROM public.bandori_tracker_topdata_latest_snapshots '
            'WHERE server = ''cn'' AND event_id = 987654330'
        );
        RAISE;
    END;
END;
$$;

SET LOCAL ROLE service_role;

DO $$
DECLARE
    sample jsonb;
    partial_sample jsonb;
    eleven_sample jsonb;
    changed jsonb;
    result record;
BEGIN
    SELECT jsonb_build_object(
        'points', jsonb_agg(
            jsonb_build_object(
                'time', 2000000000000::bigint,
                'uid', 100000 + position,
                'value', 1000000 - position
            ) ORDER BY position
        ),
        'users', jsonb_agg(
            jsonb_build_object(
                'uid', 100000 + position,
                'name', 'user-' || position,
                'introduction', '',
                'rank', 100 + position,
                'sid', CASE WHEN position = 1 THEN 0 ELSE 1800 + position END,
                'strained', CASE WHEN position % 2 = 0 THEN 1 ELSE 0 END,
                'degrees', CASE
                    WHEN position = 1 THEN '[]'::jsonb
                    ELSE jsonb_build_array(8000 + position, 9000 + position)
                END
            ) ORDER BY position
        )
    )
    INTO sample
    FROM generate_series(1, 10) AS positions(position);

    SELECT * INTO result
    FROM public.upsert_bandori_tracker_topdata_latest(
        'cn',
        987654321,
        'cn:topdata:events:987654321:2000000000000',
        2000000000000,
        sample
    );
    IF result.status <> 'written' OR result.revision <> 1 THEN
        RAISE EXCEPTION 'initial topdata write failed: %', row_to_json(result);
    END IF;

    SELECT * INTO result
    FROM public.upsert_bandori_tracker_topdata_latest(
        'cn',
        987654321,
        'cn:topdata:events:987654321:2000000000000',
        2000000000000,
        sample
    );
    IF result.status <> 'duplicate' OR result.revision <> 1 THEN
        RAISE EXCEPTION 'topdata duplicate retry failed: %', row_to_json(result);
    END IF;

    changed := jsonb_set(sample, '{points,0,value}', '9999999'::jsonb);
    SELECT * INTO result
    FROM public.upsert_bandori_tracker_topdata_latest(
        'cn',
        987654321,
        'cn:topdata:events:987654321:2000000000000',
        2000000000000,
        changed
    );
    IF result.status <> 'conflict' OR result.revision <> 1 THEN
        RAISE EXCEPTION 'topdata same-time conflict failed: %', row_to_json(result);
    END IF;

    changed := jsonb_set(sample, '{points}', (
        SELECT jsonb_agg(jsonb_set(point, '{time}', '1999999999000'::jsonb) ORDER BY ordinal)
        FROM jsonb_array_elements(sample -> 'points') WITH ORDINALITY AS points(point, ordinal)
    ));
    SELECT * INTO result
    FROM public.upsert_bandori_tracker_topdata_latest(
        'cn',
        987654321,
        'cn:topdata:events:987654321:1999999999000',
        1999999999000,
        changed
    );
    IF result.status <> 'stale' OR result.revision <> 1 THEN
        RAISE EXCEPTION 'topdata stale retry failed: %', row_to_json(result);
    END IF;

    changed := jsonb_set(sample, '{points}', (
        SELECT jsonb_agg(jsonb_set(point, '{time}', '2000000001000'::jsonb) ORDER BY ordinal)
        FROM jsonb_array_elements(sample -> 'points') WITH ORDINALITY AS points(point, ordinal)
    ));
    SELECT * INTO result
    FROM public.upsert_bandori_tracker_topdata_latest(
        'cn',
        987654321,
        'cn:topdata:events:987654321:2000000001000',
        2000000001000,
        changed
    );
    IF result.status <> 'written' OR result.revision <> 2 THEN
        RAISE EXCEPTION 'topdata newer write failed: %', row_to_json(result);
    END IF;

    partial_sample := jsonb_set(
        jsonb_set(sample, '{points}', (sample -> 'points') - 9),
        '{users}',
        (sample -> 'users') - 9
    );
    SELECT * INTO result
    FROM public.upsert_bandori_tracker_topdata_latest(
        'cn',
        987654322,
        'cn:topdata:events:987654322:2000000000000',
        2000000000000,
        partial_sample
    );
    IF result.status <> 'written' OR result.revision <> 1 THEN
        RAISE EXCEPTION 'nine-point topdata snapshot was rejected: %', row_to_json(result);
    END IF;
    SELECT * INTO result
    FROM public.upsert_bandori_tracker_topdata_latest(
        'cn',
        987654322,
        'cn:topdata:events:987654322:2000000000000',
        2000000000000,
        partial_sample
    );
    IF result.status <> 'duplicate' OR result.revision <> 1 THEN
        RAISE EXCEPTION 'nine-point topdata duplicate failed: %', row_to_json(result);
    END IF;

    SELECT * INTO result
    FROM public.upsert_bandori_tracker_topdata_latest(
        'cn',
        987654336,
        'cn:topdata:events:987654336:2000000000000',
        2000000000000,
        jsonb_build_object(
            'points', jsonb_build_array(sample -> 'points' -> 0),
            'users', jsonb_build_array(sample -> 'users' -> 0)
        )
    );
    IF result.status <> 'written' OR result.revision <> 1 THEN
        RAISE EXCEPTION 'one-point topdata snapshot was rejected: %', row_to_json(result);
    END IF;

    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn',
            987654322,
            'cn:topdata:events:987654322:2000000001000',
            2000000001000,
            jsonb_build_object('points', '[]'::jsonb, 'users', '[]'::jsonb)
        );
        RAISE EXCEPTION 'empty topdata snapshot was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'empty topdata snapshot was accepted' THEN RAISE; END IF;
    END;
    SELECT revision, observed_at INTO result
    FROM public.bandori_tracker_topdata_latest_snapshots
    WHERE server = 'cn' AND event_id = 987654322;
    IF result.revision <> 1 OR result.observed_at <> 2000000000000 THEN
        RAISE EXCEPTION 'empty topdata snapshot changed the existing latest row';
    END IF;

    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn',
            987654323,
            'cn:topdata:events:987654323:2000000000000',
            2000000000000,
            jsonb_set(sample, '{users,0,uid}', '999999'::jsonb)
        );
        RAISE EXCEPTION 'topdata user coverage mismatch was accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'topdata user coverage mismatch was accepted' THEN
                RAISE;
            END IF;
    END;

    eleven_sample := jsonb_set(
        jsonb_set(
            sample,
            '{points}',
            (sample -> 'points') || jsonb_build_array(jsonb_build_object(
                'time', 2000000000000::bigint,
                'uid', 999999,
                'value', 1
            ))
        ),
        '{users}',
        (sample -> 'users') || jsonb_build_array(jsonb_build_object(
            'uid', 999999,
            'name', 'eleventh',
            'introduction', '',
            'rank', 1,
            'sid', 0,
            'strained', 0,
            'degrees', '[]'::jsonb
        ))
    );
    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn', 987654324,
            'cn:topdata:events:987654324:2000000000000', 2000000000000,
            eleven_sample
        );
        RAISE EXCEPTION 'eleven-point topdata snapshot was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'eleven-point topdata snapshot was accepted' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn', 987654325,
            'cn:topdata:events:987654325:2000000000000', 2000000000000,
            jsonb_set(sample, '{points,1,uid}', sample -> 'points' -> 0 -> 'uid')
        );
        RAISE EXCEPTION 'duplicate point UID was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'duplicate point UID was accepted' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn', 987654326,
            'cn:topdata:events:987654326:2000000000000', 2000000000000,
            jsonb_set(sample, '{points,0,time}', '1999999999000'::jsonb)
        );
        RAISE EXCEPTION 'mixed point times were accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'mixed point times were accepted' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn', 987654327,
            'cn:topdata:events:987654327:2000000000000', 2000000000000,
            jsonb_set(sample, '{points,1,value}', '2000000'::jsonb)
        );
        RAISE EXCEPTION 'increasing point values were accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'increasing point values were accepted' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn', 987654328,
            'cn:topdata:events:987654328:2000000000000', 2000000000000,
            jsonb_set(sample, '{users}', (sample -> 'users') - 9)
        );
        RAISE EXCEPTION 'partial user registry was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'partial user registry was accepted' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn', 987654329,
            'cn:topdata:events:987654329:2000000000000', 2000000000000,
            sample - 'users'
        );
        RAISE EXCEPTION 'partial topdata payload was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'partial topdata payload was accepted' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn', 987654331,
            'cn:topdata:events:987654331:9007199254740992', 9007199254740992,
            sample
        );
        RAISE EXCEPTION 'unsafe publishedAt was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'unsafe publishedAt was accepted' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn', 987654332,
            'cn:topdata:events:987654332:2000000000000', 2000000000000,
            jsonb_set(sample, '{points,0,uid}', '9007199254740992'::jsonb)
        );
        RAISE EXCEPTION 'unsafe point UID was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'unsafe point UID was accepted' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn', 987654333,
            'cn:topdata:events:987654333:2000000000000', 2000000000000,
            jsonb_set(sample, '{users,0,sid}', '9007199254740992'::jsonb)
        );
        RAISE EXCEPTION 'unsafe user integer was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'unsafe user integer was accepted' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn', 987654334,
            'cn:topdata:events:987654334:2000000000000', 2000000000000,
            jsonb_set(sample, '{users,0,degrees}', '[1,2,3]'::jsonb)
        );
        RAISE EXCEPTION 'three user degrees were accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'three user degrees were accepted' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn', 987654335,
            'cn:topdata:events:987654335:2000000000000', 2000000000000,
            jsonb_set(sample, '{users,0,name}', to_jsonb(repeat('x', 262144)))
        );
        RAISE EXCEPTION 'oversized topdata payload was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'oversized topdata payload was accepted' THEN RAISE; END IF;
    END;

    UPDATE public.bandori_tracker_topdata_latest_snapshots
    SET revision = 9007199254740991,
        payload = jsonb_set(payload, '{revision}', '9007199254740991'::jsonb)
    WHERE server = 'cn' AND event_id = 987654321;
    changed := jsonb_set(sample, '{points}', (
        SELECT jsonb_agg(jsonb_set(point, '{time}', '2000000002000'::jsonb) ORDER BY ordinal)
        FROM jsonb_array_elements(sample -> 'points') WITH ORDINALITY AS points(point, ordinal)
    ));
    BEGIN
        PERFORM public.upsert_bandori_tracker_topdata_latest(
            'cn', 987654321,
            'cn:topdata:events:987654321:2000000002000', 2000000002000,
            changed
        );
        RAISE EXCEPTION 'revision overflow was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'revision overflow was accepted' THEN RAISE; END IF;
    END;
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}',
    true
);
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.bandori_tracker_topdata_latest_snapshots
        WHERE server = 'cn' AND event_id = 987654321
    ) THEN
        RAISE EXCEPTION 'anonymous authenticated JWT read topdata latest';
    END IF;
END;
$$;

SELECT set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',
    true
);
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.bandori_tracker_topdata_latest_snapshots
        WHERE server = 'cn' AND event_id = 987654321
    ) THEN
        RAISE EXCEPTION 'registered authenticated JWT could not read topdata latest';
    END IF;
END;
$$;

RESET ROLE;
SELECT extensions.pass('Bandori TOP10 latest security and RPC contract is valid');
SELECT * FROM extensions.finish();
ROLLBACK;
