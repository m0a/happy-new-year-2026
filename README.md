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

## Tech Stack

- **Frontend:** TypeScript, Three.js, Vite
- **Backend:** Cloudflare Pages Functions
- **Database:** Cloudflare D1 (SQLite)
- **CI/CD:** GitHub Actions

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

パラメータなしの場合は全員のスコアが表示されます。

## License

MIT
