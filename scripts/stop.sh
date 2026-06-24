#!/usr/bin/env bash
#
# Acrylic Stage の開発プロセスを停止する。
# dev.sh を起動しっぱなしのターミナルが見つからない時の保険。
#

set -u

killed=0
maybe_kill() {
  local pattern="$1"
  local pids
  pids=$(pgrep -f "$pattern" || true)
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    killed=$((killed + $(echo "$pids" | wc -w | tr -d ' ')))
  fi
}

maybe_kill "uvicorn main:app"
maybe_kill "concurrently.*npm:dev"
maybe_kill "node.*acrylic-stage/electron.*vite"
maybe_kill "electron .*acrylic-stage"

sleep 0.5

# 念のため残党も
maybe_kill "uvicorn main:app"
maybe_kill "node.*acrylic-stage/electron.*vite"

if [[ "$killed" -eq 0 ]]; then
  echo "(動作中のプロセスは見つかりませんでした)"
else
  echo "停止: ${killed} プロセスに SIGTERM"
fi
