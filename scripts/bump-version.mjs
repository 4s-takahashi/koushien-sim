#!/usr/bin/env node
/**
 * バージョンメタデータ更新スクリプト
 *
 * 役割:
 * - src/version.ts の BUILD_DATE と GIT_SHA を現在時刻・現在のコミットで更新する
 * - package.json の version を src/version.ts の VERSION に同期させる
 *
 * 使い方:
 *   npm run bump          # BUILD_DATE と GIT_SHA を更新
 *   npm run bump:patch    # Patch を +1 (0.11.0 → 0.11.1)
 *   npm run bump:minor    # Minor を +1 (0.11.0 → 0.12.0)
 *   npm run bump:major    # Major を +1 (0.11.0 → 1.0.0)
 *
 * デプロイ前に必ず実行すること（高橋さん指示 2026-04-19）
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const VERSION_FILE = resolve(ROOT, 'src/version.ts');
const PACKAGE_FILE = resolve(ROOT, 'package.json');

// --- 引数解析 ---
const arg = process.argv[2] || 'meta'; // meta | patch | minor | major
const VALID_ARGS = ['meta', 'patch', 'minor', 'major'];
if (!VALID_ARGS.includes(arg)) {
  console.error(`[bump] Invalid arg: ${arg}. Valid: ${VALID_ARGS.join(', ')}`);
  process.exit(1);
}

// --- 現在のバージョン読み込み ---
let versionFile = readFileSync(VERSION_FILE, 'utf-8');
const versionMatch = versionFile.match(/export const VERSION = '([^']+)';/);
if (!versionMatch) {
  console.error('[bump] VERSION not found in src/version.ts');
  process.exit(1);
}
const currentVersion = versionMatch[1];
const [major, minor, patch] = currentVersion.split('.').map((n) => parseInt(n, 10));

// --- 新バージョン決定 ---
let newVersion = currentVersion;
if (arg === 'patch') newVersion = `${major}.${minor}.${patch + 1}`;
if (arg === 'minor') newVersion = `${major}.${minor + 1}.0`;
if (arg === 'major') newVersion = `${major + 1}.0.0`;

// --- ビルドメタデータ取得 ---
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const buildDate = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`;

let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  const dirty = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
  if (dirty) gitSha += '-dirty';
} catch (e) {
  console.warn('[bump] git sha 取得失敗:', e.message);
}

// --- version.ts 書き換え ---
versionFile = versionFile.replace(
  /export const VERSION = '[^']+';/,
  `export const VERSION = '${newVersion}';`
);
versionFile = versionFile.replace(
  /export const BUILD_DATE = '[^']+';/,
  `export const BUILD_DATE = '${buildDate}';`
);
versionFile = versionFile.replace(
  /export const GIT_SHA = '[^']+';/,
  `export const GIT_SHA = '${gitSha}';`
);
writeFileSync(VERSION_FILE, versionFile);

// --- package.json 同期 ---
const pkg = JSON.parse(readFileSync(PACKAGE_FILE, 'utf-8'));
pkg.version = newVersion;
writeFileSync(PACKAGE_FILE, JSON.stringify(pkg, null, 2) + '\n');

// --- 結果出力 ---
console.log(`[bump] VERSION: ${currentVersion} → ${newVersion}`);
console.log(`[bump] BUILD_DATE: ${buildDate}`);
console.log(`[bump] GIT_SHA: ${gitSha}`);

if (arg !== 'meta') {
  console.log('');
  console.log('⚠️  VERSION が上がりました。src/version.ts の CHANGELOG にエントリを追加してください。');
}
