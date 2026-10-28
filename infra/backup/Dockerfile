# syntax=docker/dockerfile:1
# Nightly database backup (ALY-63): dump, encrypt, copy to every destination, prune.
# Built from infra/backup:  docker build -t alyr-backup infra/backup
# Runs once and exits: a scheduled job in the cloud, or `docker compose run backup`.
FROM alpine:3.22
# The PostgreSQL tools must be the database server's major version. A newer pg_dump can
# read an older server, but its dumps then carry settings the older server rejects on
# restore (found in the rehearsal: pg_restore 17 into PostgreSQL 16 fails on
# "transaction_timeout"). Change PG_MAJOR together with the server's version.
ARG PG_MAJOR=16
# age: encryption to a public key; only the founder holds the private key.
# rclone: one tool for every destination (Google Cloud Storage, Cloudflare R2, Azure Blob).
RUN apk add --no-cache bash coreutils "postgresql${PG_MAJOR}-client" age rclone \
 && adduser -D -u 10001 backup \n && mkdir /backups && chown backup /backups
COPY --chmod=755 backup.sh restore.sh /usr/local/bin/
USER 10001
WORKDIR /tmp
ENTRYPOINT ["/usr/local/bin/backup.sh"]
