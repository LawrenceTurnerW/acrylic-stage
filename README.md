# Acrylic Stage

> 机に置いたアクスタが、魔法アイドルとしてライブ(=戦闘)に出撃する自動進行型RPG。
> **Palette Project(パレプロ)** を題材にしたファン制作物。

---

## ⚠️ 重要な注記

- 本プロジェクトは **個人によるファン制作物** であり、**Palette Project 公式とは一切無関係**です
- 本リポジトリには **キャラクター画像・公式素材は一切含まれません**。画像が必要な場合は各自で用意してください
- 二次創作にあたる利用については、必ず[Palette Project 二次創作ガイドライン](https://paletteproject.jp/guidelines/) を参照・遵守してください

---

## 📂 仕様ファイル

| ファイル | 内容 |
|---|---|
| [`SPEC.md`](./SPEC.md) | **全体仕様書(最初に読むこと)** |
| [`characters.yaml`](./characters.yaml) | 7キャラのステータス・属性・必殺技定義 |
| [`stages.yaml`](./stages.yaml) | ステージ1の敵編成・ボスギミック |
| [`dialogue.yaml`](./dialogue.yaml) | 戦闘実況テンプレ集(49件) |

---

## 🚀 Claude Code への導入指示

### まず実装するもの(Day 1-2 スケルトン)

以下の順番でスケルトンを構築してください:

1. **ディレクトリ作成**(SPEC §2.5 参照)
   ```
   acrylic-stage/
   ├── backend/
   │   ├── main.py
   │   ├── config/
   │   ├── core/
   │   └── engine/
   └── electron/
       ├── main.js
       └── renderer/
   ```

2. **設定ファイル配置**: 本リポジトリの YAML 3つ(`characters.yaml`, `stages.yaml`, `dialogue.yaml`)を `backend/config/` にコピー

3. **FastAPI 骨格**: `backend/main.py` で WebSocket(`/ws/live`) と HTTP エンドポイント(`/start_battle`, `/state`) を立てる

4. **Electron 最小UI**: タイトル画面 → 「テスト開始」ボタン → 空の戦闘画面、まで遷移するだけ

5. **WebSocket 疎通確認**: バックエンドが2秒に1回ダミーメッセージを送り、Electron側で表示

6. **ArUco 認識**: USBカメラ or PC内蔵カメラから映像取得、`DICT_4X4_50` でマーカーID 0〜6 を検出、5fpsで実行。検出結果を WebSocket でフロントに送る

7. **キャリブレーション画面**: カメラ画像を表示し、「前列ライン」を画面に重ねて見せる(設定画面で閾値変更可能に)

### Day 3以降の進め方

`SPEC.md` の §11(実装スケジュール)に従って進めてください。各日のゴールが明確に書かれています。

---

## 🎯 重要な設計方針(必読)

1. **LLM API は使わない**。全ロジックローカル完結
2. **全データは YAML 外出し**。バランス調整がコード変更なしでできるように
3. **必殺技の効果は「効果タイプ + パラメータ」のデータ駆動**(ハードコード禁止)
4. **ArUco 認識は 5fps**(60fpsは不要、CPU/カメラ負荷を抑える)
5. **キャラセリフは固定テンプレ集からランダム選択**(LLM生成しない)

---

## 🧪 セットアップ手順

### 前提
- Python 3.11+(3.14 でも動作確認済み。OpenCV のホイールが Python 3.14 で揃っていることを確認)
- Node.js 18+
- カメラアクセス(macOS の場合、ターミナルアプリにカメラ権限を許可)

### バックエンド
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

起動後、確認用エンドポイント:
- `http://127.0.0.1:8000/health` → `{"ok": true}`
- `http://127.0.0.1:8000/state` → 現在の game state
- `ws://127.0.0.1:8000/ws/live` → heartbeat (2 秒間隔) + aruco_frame (5fps)

### フロントエンド
```bash
cd electron
npm install
npm run dev
```

`npm run dev` で Vite (renderer の HMR) と Electron が並行起動する。タイトル画面 → 「キャリブレーション」タブでカメラ映像と前列ラインを確認。

### macOS のカメラ権限について
初回起動時にカメラ権限ダイアログが出る。ターミナル(または Claude Code を起動した親アプリ)に対して「カメラ」を許可すること。
OpenCV のスレッド制約を避けるため `OPENCV_AVFOUNDATION_SKIP_AUTH=1` を `main.py` で設定済み。

---

## 🎮 物理セットアップ

| 項目 | 詳細 |
|---|---|
| カメラ | PC内蔵カメラ or USBカメラを画面上部に固定 |
| アクスタの向き | **正面をプレイヤー側、背面をカメラ側** に向ける |
| ArUcoマーカー | 2cm 角を台座背面 or 本体背面下部に貼付 |
| 配置エリア | カメラから 30〜60cm の机上、Y座標で前列/後列を判定 |

詳細は `SPEC.md` §3.5 参照。

---

## 🖼️ キャラクター画像について

本リポジトリには画像ファイルは含まれていません。アプリ実行時には以下を別途用意してください:

- 7体それぞれの顔写真(PNG推奨)
- 配置: `backend/assets/characters/`(`.gitignore` 対象)
- ファイル名: `characters.yaml` の `id` フィールドに対応(例: `nanami_rona.png`)

画像が用意できない場合、アプリは個人カラーのカラーチップ + キャラ名表示で動作します(フォールバック)。

---

## 📜 ライセンス

本リポジトリの **コード部分** は [MIT License](./LICENSE) で公開されています。

ただし、Palette Project に関連する **キャラクター・楽曲・公式素材** はライセンス対象に含まれず、本リポジトリにも一切含まれていません。これらの利用については [Palette Project 二次創作ガイドライン](https://paletteproject.jp/guidelines/) を遵守してください。

---

## 🎤 デモシナリオ(発表3分用)

`SPEC.md` §13 参照。

中盤の「**警告カウントダウン → アクスタを手に取って動かす → セーフ!**」が最大のハイライト。
