/**
 * match-team-builder — HighSchool → MatchTeam 変換
 *
 * tournament-bracket と practice-game の両方から使用する共通ユーティリティ。
 */

import type { HighSchool } from './world-state';
import type { MatchTeam } from '../match/types';

/**
 * HighSchool から quick-game / runGame 用の MatchTeam を構築する。
 * フィールドポジションはシンプルなデフォルト割り当て。
 *
 * ⚠️ 重要: battingOrder に含まれる全プレイヤーは必ず matchPlayers にも入れる。
 * これを守らないと、打席が回ってきた時に find で見つからず「打者 不明」で試合停止する。
 * (2026-04-19 バグ修正)
 */
export function buildMatchTeam(school: HighSchool): MatchTeam {
  const lineup = school.lineup;

  // ── 打順を先に決める ──
  let battingOrder: string[];
  if (lineup && lineup.battingOrder && lineup.battingOrder.length >= 9) {
    battingOrder = lineup.battingOrder.slice(0, 9);
  } else {
    battingOrder = school.players.slice(0, 9).map((p) => p.id);
  }

  // ── battingOrder に含まれる全プレイヤーを必ず含むように matchPlayers を構成 ──
  // 上位 18 人をベースにするが、battingOrder にそれ以外の選手がいたら追加する
  const top18 = school.players.slice(0, 18);
  const top18Ids = new Set(top18.map((p) => p.id));

  // battingOrder に含まれてるが top18 にいない選手を探す
  const missingOrderPlayers = battingOrder
    .map((pid) => school.players.find((p) => p.id === pid))
    .filter((p): p is NonNullable<typeof p> => p != null && !top18Ids.has(p.id));

  const players = [...top18, ...missingOrderPlayers];
  const matchPlayers = players.map((p) => ({
    player: p,
    pitchCountInGame: 0,
    stamina: 100,
    confidence: p.stats.base.mental,
    isWarmedUp: false,
  }));

  // ── 整合性チェック: battingOrder の全ID が matchPlayers に存在することを保証 ──
  const playerIdSet = new Set(matchPlayers.map((mp) => mp.player.id));
  for (let i = 0; i < battingOrder.length; i++) {
    if (!playerIdSet.has(battingOrder[i])) {
      // 見つからないIDは school.players の i 番目で埋める（フォールバック）
      const fallback = school.players[i];
      if (fallback) {
        battingOrder[i] = fallback.id;
        if (!playerIdSet.has(fallback.id)) {
          matchPlayers.push({
            player: fallback,
            pitchCountInGame: 0,
            stamina: 100,
            confidence: fallback.stats.base.mental,
            isWarmedUp: false,
          });
          playerIdSet.add(fallback.id);
        }
      }
    }
  }

  // 投手を探す（pitching stats を持つ選手を優先。school 全体から探す）
  // matchPlayers だけでなく school.players 全体も見て、stats.pitching !== null の
  // 選手がいればそれを投手にする。見つからなければ school.players[0] に
  // 仮の pitching stats を付与して投げさせる（試合が止まらないようにするため）。
  // (2026-04-19 バグ修正: stats.pitching=null の選手が投手になるとNPE)
  const pitcherPlayer =
    players.find((p) => p.position === 'pitcher' && p.stats.pitching !== null) ??
    players.find((p) => p.stats.pitching !== null) ??
    school.players.find((p) => p.stats.pitching !== null);

  if (!pitcherPlayer) {
    // どうしても投手がいない場合: school.players[0] に緊急用 pitching stats を付与
    const emergency = school.players[0];
    if (emergency && emergency.stats.pitching === null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (emergency as any).stats = {
        ...emergency.stats,
        pitching: {
          velocity: 110,
          control: 40,
          pitchStamina: 40,
          pitches: { fastball: 3, curve: 2 },
        },
      };
    }
  }

  const finalPitcher = pitcherPlayer ?? school.players[0];
  const currentPitcherId = finalPitcher?.id ?? '';

  // 選んだ投手が matchPlayers に含まれていなければ追加する
  if (finalPitcher && !matchPlayers.some((mp) => mp.player.id === finalPitcher.id)) {
    matchPlayers.push({
      player: finalPitcher,
      pitchCountInGame: 0,
      stamina: 100,
      confidence: finalPitcher.stats.base.mental,
      isWarmedUp: false,
    });
  }

  const fieldPositions = new Map<string, import('../types/player').Position>();
  const defaultPositions: import('../types/player').Position[] = [
    'pitcher', 'catcher', 'first', 'second',
    'third', 'shortstop', 'left', 'center', 'right',
  ];
  battingOrder.forEach((pid, i) => {
    if (i < defaultPositions.length) {
      fieldPositions.set(pid, defaultPositions[i]);
    }
  });

  const benchPlayerIds = players
    .filter((p) => !battingOrder.includes(p.id))
    .map((p) => p.id);

  return {
    id: school.id,
    name: school.name,
    shortName: school.shortName,
    players: matchPlayers,
    battingOrder,
    fieldPositions,
    currentPitcherId,
    benchPlayerIds,
    usedPlayerIds: new Set(),
  };
}
