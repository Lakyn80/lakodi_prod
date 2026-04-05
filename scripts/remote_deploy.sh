#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${1:?Zadejte cílový adresář aplikace.}"
ENV_FILE="${2:-}"
COMPOSE_FILES="${3:-docker-compose.yml:docker-compose.prod.yml}"
NEW_IMAGE_TAG="${IMAGE_TAG:?Zadejte IMAGE_TAG pro deploy.}"

cd "${APP_DIR}"

if [[ -z "${ENV_FILE}" ]]; then
  if [[ -f ".env.prod" ]]; then
    ENV_FILE=".env.prod"
  elif [[ -f ".env" ]]; then
    ENV_FILE=".env"
  fi
fi

if [[ -z "${ENV_FILE}" || ! -f "${ENV_FILE}" ]]; then
  echo "Chybí env soubor ${ENV_FILE}." >&2
  exit 1
fi

compose_args=(--env-file "${ENV_FILE}")
IFS=':' read -r -a compose_files <<< "${COMPOSE_FILES}"
for compose_file in "${compose_files[@]}"; do
  compose_args+=(-f "${compose_file}")
done

read_env_value() {
  local env_file="$1"
  local env_key="$2"
  grep -E "^${env_key}=" "${env_file}" | tail -n 1 | cut -d'=' -f2- || true
}

update_env_value() {
  local env_file="$1"
  local env_key="$2"
  local env_value="$3"
  local tmp_file="${env_file}.tmp"
  grep -Ev "^${env_key}=" "${env_file}" > "${tmp_file}" || true
  printf '%s=%s\n' "${env_key}" "${env_value}" >> "${tmp_file}"
  mv "${tmp_file}" "${env_file}"
}

http_check() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    local code
    code="$(curl -k -L -s -o /dev/null -w "%{http_code}" "${url}" || true)"
    [[ "${code}" =~ ^[23][0-9][0-9]$ ]]
    return
  fi

  python3 - "$url" <<'PY'
import sys
import urllib.request

url = sys.argv[1]
try:
    with urllib.request.urlopen(url, timeout=10) as response:
        if 200 <= response.status < 400:
            sys.exit(0)
except Exception:
    pass
sys.exit(1)
PY
}

wait_for_url() {
  local url="$1"
  local attempts="${2:-30}"
  local sleep_seconds="${3:-2}"

  for (( attempt=1; attempt<=attempts; attempt++ )); do
    if http_check "${url}"; then
      return 0
    fi
    sleep "${sleep_seconds}"
  done

  return 1
}

previous_tag="$(read_env_value "${ENV_FILE}" "IMAGE_TAG")"
backend_health_url="$(read_env_value "${ENV_FILE}" "BACKEND_HEALTHCHECK_URL")"
frontend_health_url="$(read_env_value "${ENV_FILE}" "FRONTEND_HEALTHCHECK_URL")"

cp "${ENV_FILE}" "${ENV_FILE}.bak"
update_env_value "${ENV_FILE}" "PREVIOUS_IMAGE_TAG" "${previous_tag}"
update_env_value "${ENV_FILE}" "IMAGE_TAG" "${NEW_IMAGE_TAG}"

docker compose "${compose_args[@]}" config >/dev/null
docker compose "${compose_args[@]}" pull
docker compose "${compose_args[@]}" up -d --remove-orphans

deploy_failed="false"

if [[ -n "${backend_health_url}" ]] && ! wait_for_url "${backend_health_url}" 30 2; then
  echo "Backend healthcheck selhal: ${backend_health_url}" >&2
  deploy_failed="true"
fi

if [[ -n "${frontend_health_url}" ]] && ! wait_for_url "${frontend_health_url}" 30 2; then
  echo "Frontend healthcheck selhal: ${frontend_health_url}" >&2
  deploy_failed="true"
fi

if [[ "${deploy_failed}" == "true" ]]; then
  if [[ -n "${previous_tag}" ]]; then
    echo "Obnovuji předchozí image tag ${previous_tag}." >&2
    update_env_value "${ENV_FILE}" "IMAGE_TAG" "${previous_tag}"
    docker compose "${compose_args[@]}" pull
    docker compose "${compose_args[@]}" up -d --remove-orphans
  fi
  exit 1
fi

docker image prune -f >/dev/null 2>&1 || true
echo "Deploy hotový s image tagem ${NEW_IMAGE_TAG}."
