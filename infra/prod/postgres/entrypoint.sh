#!/bin/sh
# A new volume can be mounted owned by root (a fresh bind mount or host
# directory), but this image runs Postgres as `postgres` (uid 1000), so initdb
# cannot create PGDATA and the container crash-loops (DR-004). Hand the mount
# to postgres, then run the image's own entrypoint as postgres.
set -eu
chown postgres:postgres /home/postgres/pgdata
exec gosu postgres /docker-entrypoint.sh "$@"
