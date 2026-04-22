#!/usr/bin/env bash
# scripts/dump-redis.sh
#
# 移行前に Redis の全データを JSON ファイルにダンプする。
# VPS で実行してください。
#
# 使用方法:
#   chmod +x scripts/dump-redis.sh
#   REDIS_URL="redis://localhost:6379" bash scripts/dump-redis.sh
#
# 出力: redis-dump-YYYYMMDD-HHMMSS.json

set -euo pipefail

REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
OUTPUT="redis-dump-${TIMESTAMP}.json"

echo "[dump] Redis ダンプ開始: ${REDIS_URL}"
echo "[dump] 出力先: ${OUTPUT}"

# redis-cli のパスを確認
if ! command -v redis-cli &> /dev/null; then
  echo "[dump] エラー: redis-cli が見つかりません"
  exit 1
fi

# 全キーを取得してダンプ
redis-cli -u "${REDIS_URL}" --no-auth-warning eval "
local keys = redis.call('KEYS', '*')
local result = {}
for _, key in ipairs(keys) do
  local val = redis.call('GET', key)
  if val then
    result[#result+1] = key
    result[#result+1] = val
  end
end
return result
" 0 | python3 -c "
import sys, json
lines = [l.rstrip() for l in sys.stdin if l.strip()]
# redis-cli output: '1) \"key\"', '2) \"value\"' ...
pairs = {}
i = 0
while i < len(lines):
    line = lines[i]
    if ') ' in line:
        val = line.split(') ', 1)[1].strip('\"')
        if i % 2 == 0:
            current_key = val
        else:
            try:
                pairs[current_key] = json.loads(val)
            except json.JSONDecodeError:
                pairs[current_key] = val
    i += 1
print(json.dumps(pairs, ensure_ascii=False, indent=2))
" > "${OUTPUT}"

echo "[dump] 完了: $(wc -l < "${OUTPUT}") 行"
echo "[dump] ファイル: ${OUTPUT}"
