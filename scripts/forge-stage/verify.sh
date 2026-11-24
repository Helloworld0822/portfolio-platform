#!/bin/sh
set -eu
sql() {
    psql --no-psqlrc -At -v ON_ERROR_STOP=1 "$TEST_DATABASE_URL" -c "$1"
}
expected=$(ls /stage/migrations/*.sql | wc -l | tr -d ' ')
[ "$(sql "SELECT array_agg(version ORDER BY version) = ARRAY(SELECT generate_series(1,$expected)::bigint) FROM _sqlx_migrations WHERE success")" = t ]
if [ "$STAGE_SCHEMA" = upgraded ]; then
    [ "$(sql "SELECT count(*) FROM _sqlx_migrations WHERE description='stage-upgrade' AND octet_length(checksum)=48")" = 15 ]
    [ "$(sql "SELECT count(*) FROM timeline_entries WHERE title='stage-upgrade-sentinel' AND icon_url='' AND attachments='[]'::jsonb AND marker_color='default'")" = 1 ]
    sql "DELETE FROM timeline_entries WHERE title='stage-upgrade-sentinel'"
fi
python3 /stage/integration.py
python3 /stage/timeline_markers.py
exec python3 -m http.server 19091 --bind 0.0.0.0 --directory /tmp
