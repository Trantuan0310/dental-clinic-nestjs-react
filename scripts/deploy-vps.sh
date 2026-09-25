#!/usr/bin/env bash
# Upgrade the VPS deployment (docker-compose.prod.yml with the local
# PostgreSQL service) to a git ref, default origin/main.
#
#   cd /opt/dental-clinic/production && bash scripts/deploy-vps.sh [ref]
#
# Run it from inside the project checkout. On a machine that does not have
# the script yet:
#   git fetch origin && git show origin/main:scripts/deploy-vps.sh > /tmp/deploy-vps.sh
#   bash /tmp/deploy-vps.sh
#
# Order: pre-flight checks -> database backup -> checkout -> build ->
# migrate -> restart backend/web -> wait for the backend health check.
# Stops at the first failing step. The backup and the previous commit are
# printed at the end; docs/08_Deployment/VPS_UPGRADE.md explains rollback.
set -euo pipefail

# `git checkout` below replaces this very file, and bash reads a script as it
# runs; run from a private copy so the new version can't change this run.
ROOT="${DEPLOY_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
if [ -z "${DEPLOY_REEXEC:-}" ]; then
  COPY="$(mktemp)"
  cp "$0" "$COPY"
  DEPLOY_REEXEC=1 DEPLOY_ROOT="$ROOT" exec bash "$COPY" "$@"
fi
cd "$ROOT"
REF="${1:-origin/main}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-/opt/dental-clinic/backups}"
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
step() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

step "Pre-flight"
[ -f "$ENV_FILE" ] || die "$ENV_FILE not found in $(pwd)"
git rev-parse --git-dir >/dev/null 2>&1 || die "$(pwd) is not a git checkout"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no
  die "tracked files were edited on this server; commit, stash or revert them first"
fi
compose ps --status running --services | grep -qx postgres \
  || die "the postgres service is not running (start it: docker compose ... up -d postgres)"
PREV="$(git rev-parse HEAD)"
echo "current commit: $(git log -1 --oneline)"

step "Backup database"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F-%H%M%S)"
DUMP="$BACKUP_DIR/db-$STAMP-${PREV:0:7}.dump"
# Single quotes on purpose: the variables expand inside the postgres container.
# shellcheck disable=SC2016
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DUMP"
[ -s "$DUMP" ] || die "backup $DUMP is empty"
echo "$PREV" > "$BACKUP_DIR/previous-commit-$STAMP"
echo "backup: $DUMP ($(du -h "$DUMP" | cut -f1))"

step "Checkout $REF"
git fetch --prune origin
git checkout --detach "$REF"
echo "new commit: $(git log -1 --oneline)"

step "Build"
compose config --quiet
compose build migrate backend web

step "Migrate"
compose run --rm migrate

step "Restart backend and web"
compose up -d backend web

step "Wait for backend health"
CID="$(compose ps -q backend)"
for _ in $(seq 1 "${HEALTH_TRIES:-40}"); do
  STATUS="$(docker inspect --format '{{.State.Health.Status}}' "$CID" 2>/dev/null || echo unknown)"
  [ "$STATUS" = healthy ] && break
  sleep 3
done
[ "${STATUS:-}" = healthy ] || {
  compose logs --tail=80 backend
  die "backend is $STATUS; previous commit $PREV, backup $DUMP (see VPS_UPGRADE.md)"
}
compose ps

cat <<EOF

Done: $(git log -1 --oneline)
  previous commit: $PREV
  database backup: $DUMP
Rollback steps: docs/08_Deployment/VPS_UPGRADE.md
EOF
