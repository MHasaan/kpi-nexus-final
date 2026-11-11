#!/bin/sh
# A new Fly volume is mounted owned by root, but this image runs Postgres as
# `postgres` (uid 1000), so initdb cannot create PGDATA and the machine
# crash-loops. Hand the mount to postgres, then run the image's own
# entrypoint as postgres.
set -eu
chown postgres:postgres /home/postgres/pgdata
exec gosu postgres /docker-entrypoint.sh "$@"
