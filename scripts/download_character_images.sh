#!/usr/bin/env bash
#
# Palette Project 公式サイトからキャラ画像を取得し、backend/assets/characters/
# に character_id.png として保存する。
#
# 本リポジトリの方針(README / SPEC §12):
#   - 画像は git に含めない (.gitignore で *.png 除外済み)
#   - 利用は個人のファン制作物の範囲、二次創作ガイドラインに従う
#     https://paletteproject.jp/guidelines/
#
# 使い方: ./scripts/download_character_images.sh
#

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/backend/assets/characters"
mkdir -p "$OUT_DIR"

BASE="https://paletteproject.jp/yakusoku/image"

# 公式サイトの画像名 → このプロジェクトの character_id
declare -a PAIRS=(
  "cast_rona:nanami_rona"
  "cast_kotoha:fujimiya_kotoha"
  "cast_kyouka:enami_kyouka"
  "cast_ayumu:kitami_ayumu"
  "cast_clara:akatsuki_clara"
  "cast_kaname:tokiwa_kaname"
  "cast_hanon:kanaru_hanon"
)

failed=0
for pair in "${PAIRS[@]}"; do
  src="${pair%%:*}"
  dst="${pair##*:}"
  url="$BASE/${src}.png"
  out="$OUT_DIR/${dst}.png"
  echo "→ $src.png → ${dst}.png"
  if curl -fsSL --max-time 30 "$url" -o "$out.tmp"; then
    mv "$out.tmp" "$out"
  else
    echo "  ❌ failed ($url)" >&2
    rm -f "$out.tmp"
    failed=$((failed + 1))
  fi
done

echo
if [[ "$failed" -gt 0 ]]; then
  echo "⚠ ${failed} 件のダウンロードに失敗" >&2
  exit 1
fi
echo "✅ ${#PAIRS[@]} 件を $OUT_DIR に保存"
ls -lh "$OUT_DIR"
