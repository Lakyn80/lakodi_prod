#!/bin/sh
set -e

mkdir -p /app/data

redis-server --save "" --appendonly no &

uvicorn backend.app.main:app --host 0.0.0.0 --port 8016 &

cd /app/frontend
npm run dev -- --hostname 0.0.0.0 --port 8080
