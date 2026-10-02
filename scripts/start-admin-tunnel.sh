#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file="$project_dir/.env"

if [ ! -f "$env_file" ]; then
  echo 'ไม่พบไฟล์ .env ที่ root ของโปรเจกต์' >&2
  exit 1
fi

token=$(sed -n 's/^CLOUDFLARE_ADMIN_TUNNEL_TOKEN=//p' "$env_file" | tail -n 1)
if [ -z "$token" ] || [ "$token" = '""' ] || [ "$token" = "''" ]; then
  echo 'กรุณาใส่ CLOUDFLARE_ADMIN_TUNNEL_TOKEN ในไฟล์ .env ก่อนเปิด admin tunnel' >&2
  exit 1
fi

exec docker compose \
  --project-directory "$project_dir" \
  -f "$project_dir/docker/docker-compose.yml" \
  --profile admin-tunnel \
  up -d admin-cloudflared
