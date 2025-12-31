# HAPPY NEW YEAR 2026

新年を祝う3Dフライトシューティングゲーム

**Play Now:** https://happy-new-year-2026-cp7.pages.dev

## Features

- Three.jsによる3Dフライトシミュレーター
- 都市上空を飛行しながら敵を撃破
- 敵キャラクター：「HAPPY NEW YEAR 2026」「今年もよろしくお願いします」の文字
- HPシステム & 回復アイテム
- バックカメラ + PIPフロントビュー
- オートエイム機能
- スコアランキング（グループ別対応）
- モバイル対応タッチコントロール
- WAVE進行で敵が強化（色・サイズ・エフェクト変化）
- 敵のバックカメラ回避AI
- 弾丸のビル衝突判定

## Controls

### PC
| Key | Action |
|-----|--------|
| Mouse | 照準移動 |
| Left Click / Space | 射撃 |
| W/S or ↑/↓ | ピッチ（上下） |
| A/D or ←/→ | ヨー（左右） |
| Shift | ブースト |
| Ctrl | ブレーキ |
| C | カメラ切替（前方/後方） |

### Mobile
- 左ジョイスティック：方向操作
- FIRE：射撃
- BOOST：加速
- BRAKE：減速
- CAM：カメラ切替

### Settings
- スタート画面の「操作反転」トグルでジョイスティックY軸を反転可能

## Tech Stack

- **Frontend:** TypeScript, Three.js, Vite
- **Backend:** Cloudflare Pages Functions
- **Database:** Cloudflare D1 (SQLite)
- **CI/CD:** GitHub Actions

## Project Structure

```
src/
  main.ts          # ゲーム本体（2000行+）
functions/
  api/
    scores.ts      # スコアAPI
index.html         # スタート画面 & OGPメタタグ
schema.sql         # D1データベーススキーマ
```

### main.ts 内部モジュール

- Game State - スコア、HP、Wave管理
- Audio - BGM、射撃音、爆発音（Web Audio API）
- Three.js Setup - シーン、カメラ、レンダラー
- City Buildings - ビル群生成、窓明かり、道路
- Bullets - 弾丸発射・移動・ビル衝突判定
- Enemies - 文字敵生成、AI移動、背面回避行動
- Wave Visual Updates - Wave進行で敵の外見変化
- Recovery Items - HP回復アイテム
- Mobile Controls - タッチジョイスティック、ボタンUI
- Auto-Aim - 照準内の敵を自動追尾
- UI - HUD表示、HPバー、スコア、Wave表示
- Score API - スコア送信・取得、グループフィルタ

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=happy-new-year-2026
```

## Database Setup

```bash
# Create D1 database
npx wrangler d1 create sky-fighter-scores

# Apply schema
npx wrangler d1 execute sky-fighter-scores --file=schema.sql
```

## Group Scoring

URLに`?g=groupname`パラメータを追加することで、グループ別のスコアランキングが利用できます。

例: `https://happy-new-year-2026-cp7.pages.dev/?g=family`

**スコア表示ロジック:**
- グループ指定時：そのグループのスコア + デフォルトスコア（グループなし）を表示
- 他グループのスコアは表示されない
- パラメータなしの場合はデフォルトスコアのみ表示

## License

MIT
