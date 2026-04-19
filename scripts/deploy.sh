#!/usr/bin/env bash
# 本番 VPS (162.43.92.107) デプロイスクリプト
# 使い方: bash scripts/deploy.sh
#
# 流れ:
# 1. ローカルの git SHA を取得
# 2. rsync で /opt/koushien-sim に同期 (.git/.env 除外)
# 3. VPS 側で npm ci && DEPLOY_GIT_SHA=$SHA npm run build (bump が正しい SHA を記録)
# 4. pm2 を ecosystem.config.js で起動 (.env を source して環境変数注入)
# 5. HTTP 応答を確認

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/4s-vps-01.pem}"
VPS_HOST="${VPS_HOST:-root@162.43.92.107}"
VPS_DIR="${VPS_DIR:-/opt/koushien-sim}"

cd "$ROOT"

# 1. ローカル SHA
LOCAL_SHA=$(git rev-parse --short HEAD)
LOCAL_DIRTY=$(git status --porcelain)
if [ -n "$LOCAL_DIRTY" ]; then
  LOCAL_SHA="${LOCAL_SHA}-dirty"
  echo "⚠️  ローカルに未コミットの変更があります: $LOCAL_SHA"
fi
echo "[deploy] local SHA: $LOCAL_SHA"

# 2. rsync (.env は VPS 側で管理、上書きしない)
echo "[deploy] rsync → $VPS_HOST:$VPS_DIR ..."
rsync -avz --delete \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
  --exclude node_modules \
  --exclude .git \
  --exclude .next \
  --exclude '*.log' \
  --exclude .env \
  --exclude .env.local \
  ./ "$VPS_HOST:$VPS_DIR/"

# 3. build (DEPLOY_GIT_SHA で bump に正しい SHA を渡す)
echo "[deploy] remote build (DEPLOY_GIT_SHA=$LOCAL_SHA) ..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_HOST" \
  "cd $VPS_DIR && mkdir -p logs && npm ci && DEPLOY_GIT_SHA='$LOCAL_SHA' npm run build"

# 4. pm2 restart (ecosystem.config.js + .env から環境変数注入)
echo "[deploy] pm2 restart with .env ..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_HOST" bash <<REMOTE_SCRIPT
set -euo pipefail
cd $VPS_DIR

# .env を source して pm2 に環境変数を継承させる
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  echo "[deploy-remote] loaded .env (REDIS_URL=\${REDIS_URL:-<unset>})"
else
  echo "[deploy-remote] ⚠️  .env が見つかりません"
fi

# 既存プロセスがあれば reload、なければ start
if pm2 describe koushien-sim >/dev/null 2>&1; then
  pm2 restart koushien-sim --update-env
else
  pm2 start ecosystem.config.js
fi

pm2 save
REMOTE_SCRIPT

# 5. HTTP check
sleep 3
echo "[deploy] HTTP check ..."
HTTP_CODE=$(curl -sI https://kokoyakyu-days.jp/ -o /dev/null -w '%{http_code}')
echo "[deploy] HTTP: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ] || [ "$HTTP_CODE" = "308" ]; then
  echo ""
  echo "✅ デプロイ成功 (v$(grep -E "export const VERSION" src/version.ts | cut -d "'" -f 2) / $LOCAL_SHA)"
  echo "   → https://kokoyakyu-days.jp/"
else
  echo ""
  echo "⚠️  HTTP $HTTP_CODE が返ってきた。要確認"
  exit 1
fi
