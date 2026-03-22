import type { RustBattleEntry, CharacterLeagueData } from "./utils";

export function makeEntry(overrides: Partial<RustBattleEntry> = {}): RustBattleEntry {
  return {
    date: "03/19/2026 21:33",
    player1_name: "Player1",
    player1_result: "WIN",
    player1_score_type: "LP",
    player1_score: 15000,
    player2_name: "Player2",
    player2_result: "LOSE",
    player2_score_type: "LP",
    player2_score: 14000,
    ...overrides,
  };
}

export function makeLeague(character: string, lp: number, mr: number): CharacterLeagueData {
  return { character, leaguePoint: lp, masterRate: mr };
}

export function makeNextDataHtml(infos: { char: string; lp: number; mr: number }[]): string {
  const nextData = {
    props: {
      pageProps: {
        play: {
          character_league_infos: infos.map((i) => ({
            character_alpha: i.char,
            league_info: { league_point: i.lp, master_rating: i.mr },
          })),
        },
      },
    },
  };
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></html>`;
}
