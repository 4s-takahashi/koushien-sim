/**
 * pm2 ecosystem 設定
 *
 * 使い方:
 *   pm2 start ecosystem.config.js
 *   pm2 restart koushien-sim --update-env
 *   pm2 save
 *
 * 環境変数は `/opt/koushien-sim/.env` から手動で読んで渡す設計にしていたが、
 * pm2 は dotenv を内蔵していないため、シェル側で source して pm2 を起動するか、
 * ここに直接記述する必要がある。
 *
 * → deploy.sh 側で `set -a; source .env; set +a` してから pm2 を起動することで
 *   PM2 プロセスに .env の変数が継承される。
 */

module.exports = {
  apps: [
    {
      name: 'koushien-sim',
      cwd: '/opt/koushien-sim',
      script: 'npm',
      args: 'start',
      env: {
        PORT: 3000,
        NODE_ENV: 'production',
        // REDIS_URL はシェル経由で .env から注入される (deploy.sh 参照)
      },
      autorestart: true,
      max_memory_restart: '1G',
      error_file: '/opt/koushien-sim/logs/pm2-error.log',
      out_file: '/opt/koushien-sim/logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
