#!/bin/sh
set -eu

if [ ! -f .env ]; then
  echo "Chybi .env v rootu projektu." >&2
  exit 1
fi

mkdir -p data data/uploads data/redis

docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans
