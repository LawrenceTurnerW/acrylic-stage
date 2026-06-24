#!/usr/bin/env bash
#
# Acrylic Stage 開発用ワンショット起動スクリプト。
#
# 動作:
#   1. 既存の uvicorn / vite / electron をすべて kill
#   2. backend (FastAPI + WebSocket) と frontend (Vite + Electron) を起動
#   3. ログを .dev/ に書きつつ統合 tail で表示
#   4. Ctrl-C で両方まとめて停止
#
# 使い方:
#   ./scripts/dev.sh
#

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/.dev"
mkdir -p "$LOG_DIR"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

# ── preflight: 依存が用意されているか ──────────────────────────────
if [[ ! -x "$ROOT/backend/.venv/bin/uvicorn" ]]; then
  echo "❌ backend/.venv が見つかりません。先にセットアップしてください:" >&2
  echo "   cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi
if [[ ! -d "$ROOT/electron/node_modules" ]]; then
  echo "❌ electron/node_modules が見つかりません。先にセットアップしてください:" >&2
  echo "   cd electron && npm install" >&2
  exit 1
fi

# ── 古いプロセスを停止 ────────────────────────────────────────────
echo "🧹 古いプロセスを停止中..."
"$ROOT/scripts/stop.sh" >/dev/null 2>&1 || true
sleep 1

# ── 起動 ──────────────────────────────────────────────────────────
cd "$ROOT/backend"
.venv/bin/uvicorn main:app --reload --host 127.0.0.1 --port 8000 \
  > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

cd "$ROOT/electron"
npm run dev > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

cleanup() {
  echo
  echo "🛑 停止中..."
  # 自分が起こした npm run dev (= concurrently) の子プロセスを巻き取る
  pkill -P "$FRONTEND_PID" 2>/dev/null || true
  kill "$FRONTEND_PID" 2>/dev/null || true
  kill "$BACKEND_PID" 2>/dev/null || true
  "$ROOT/scripts/stop.sh" >/dev/null 2>&1 || true
  echo "✅ 停止完了"
  exit 0
}
trap cleanup INT TERM

echo
echo "✅ 起動完了 (このターミナルで Ctrl-C すれば両方止まる)"
echo "   backend  pid=$BACKEND_PID  → http://127.0.0.1:8000"
echo "   frontend pid=$FRONTEND_PID → Electron ウィンドウが自動で開きます"
echo "   logs: $BACKEND_LOG / $FRONTEND_LOG"
echo
echo "─── ライブログ ───"

# tail -F は ファイルが切り詰められても追いかける
tail -F "$BACKEND_LOG" "$FRONTEND_LOG"
