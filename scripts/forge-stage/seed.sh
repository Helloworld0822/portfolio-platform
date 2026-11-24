#!/bin/sh
set -eu
case "$STAGE_SCHEMA" in
    fresh) exit 0 ;;
    upgraded) ;;
    *) exit 1 ;;
esac

sql() {
    psql --no-psqlrc -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" "$@"
}
sql -c "CREATE TABLE _sqlx_migrations(version bigint PRIMARY KEY, description text NOT NULL, installed_on timestamptz NOT NULL DEFAULT now(), success boolean NOT NULL, checksum bytea NOT NULL, execution_time bigint NOT NULL)"
for migration in /stage/migrations/*.sql; do
    filename=${migration##*/}
    version=$(echo "${filename%%_*}" | sed 's/^0*//')
    [ "$version" -le 13 ] || break
    sql -f "$migration"
    sql -c "INSERT INTO _sqlx_migrations(version,description,success,checksum,execution_time) VALUES($version,'stage-upgrade',true,'\\x00',0)"
done
sql -c "INSERT INTO timeline_entries(title, org, period, description, sort_order) VALUES('stage-upgrade-sentinel','','','',100)"
