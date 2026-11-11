# Postgres 16 + TimescaleDB + pgvector for Fly (OT-011): the same pinned image
# as infra/docker/docker-compose.yml, plus an entrypoint that makes the Fly
# volume usable and a first-boot script that creates a non-superuser schema
# owner (initdb/). Build context: infra/fly/postgres.
FROM timescale/timescaledb-ha:pg16@sha256:0bb4a5e5c0e24119852612dee28694d71333820b33fafeb7968497e1faf4c182
USER root
COPY fly-entrypoint.sh /usr/local/bin/fly-entrypoint.sh
COPY initdb/100_kpi_nexus_roles.sh /docker-entrypoint-initdb.d/100_kpi_nexus_roles.sh
RUN chmod 755 /usr/local/bin/fly-entrypoint.sh /docker-entrypoint-initdb.d/100_kpi_nexus_roles.sh
ENTRYPOINT ["/usr/local/bin/fly-entrypoint.sh"]
CMD ["postgres"]
