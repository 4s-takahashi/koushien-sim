/**
 * src/lib/auth-constants.ts — Edge ランタイムからも安全に import できる認証関連の定数
 *
 * middleware.ts は Edge ランタイムで動作するため、
 * Node.js 専用モジュール（bcryptjs, ioredis 経由の kv.ts）を間接的にでも
 * 含むファイルを import するとビルドエラーになる。
 *
 * → Cookie 名のような純粋な定数はこのファイルに隔離する。
 */

export const SESSION_COOKIE_NAME = 'koushien_session';
