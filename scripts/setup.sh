#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --cache /workspace/.npm
if ! docker container inspect bahceni-mongo >/dev/null 2>&1; then
  mkdir -p .data/mongo-docker
  docker run -d --name bahceni-mongo -p 127.0.0.1:27017:27017 -v "$PWD/.data/mongo-docker:/data/db" mongo:7.0.24
else
  docker start bahceni-mongo >/dev/null
fi
for attempt in {1..30}; do
  if docker exec bahceni-mongo mongosh --quiet --eval 'quit(db.adminCommand({ping:1}).ok === 1 ? 0 : 1)' >/dev/null 2>&1; then
    npm run build
    exit 0
  fi
  sleep 1
done
printf 'MongoDB hazır olmadı. docker logs bahceni-mongo ile inceleyin.\n' >&2
exit 1
