import { describe, it, expect } from "vitest";
import {
  findMyData,
  calcWinRate,
  processNewEntries,
  parseCharacterLeagueData,
  detectCharacterChange,
  pickDefaultCharacter,
} from "./utils";
import { makeEntry, makeLeague, makeNextDataHtml } from "./test-helpers";

// ============================================================
// findMyData
// ============================================================

describe("findMyData", () => {
  it("returns player1 data when username matches player1", () => {
    const entry = makeEntry();
    const result = findMyData(entry, "Player1");
    expect(result.myResult).toBe("WIN");
    expect(result.myScore).toBe(15000);
    expect(result.myScoreType).toBe("LP");
  });

  it("returns player2 data when username matches player2", () => {
    const entry = makeEntry();
    const result = findMyData(entry, "Player2");
    expect(result.myResult).toBe("LOSE");
    expect(result.myScore).toBe(14000);
    expect(result.myScoreType).toBe("LP");
  });

  it("returns player2 data when username matches neither (defaults to p2)", () => {
    const entry = makeEntry();
    const result = findMyData(entry, "UnknownPlayer");
    expect(result.myResult).toBe("LOSE");
    expect(result.myScore).toBe(14000);
  });

  it("handles MR score type for player1", () => {
    const entry = makeEntry({
      player1_score_type: "MR",
      player1_score: 1800,
    });
    const result = findMyData(entry, "Player1");
    expect(result.myScoreType).toBe("MR");
    expect(result.myScore).toBe(1800);
  });

  it("handles MR score type for player2", () => {
    const entry = makeEntry({
      player2_score_type: "MR",
      player2_score: 1500,
    });
    const result = findMyData(entry, "Player2");
    expect(result.myScoreType).toBe("MR");
    expect(result.myScore).toBe(1500);
  });

  it("handles zero scores", () => {
    const entry = makeEntry({ player1_score: 0 });
    const result = findMyData(entry, "Player1");
    expect(result.myScore).toBe(0);
  });

  it("handles Japanese usernames", () => {
    const entry = makeEntry({ player1_name: "Koroちん" });
    const result = findMyData(entry, "Koroちん");
    expect(result.myResult).toBe("WIN");
    expect(result.myScore).toBe(15000);
  });

  it("is case-sensitive for username matching", () => {
    const entry = makeEntry({ player1_name: "Player1" });
    // "player1" (lowercase) should NOT match "Player1"
    const result = findMyData(entry, "player1");
    expect(result.myResult).toBe("LOSE"); // falls to p2
  });

  it("handles empty username", () => {
    const entry = makeEntry();
    const result = findMyData(entry, "");
    expect(result.myResult).toBe("LOSE"); // neither matches, defaults to p2
  });

  it("handles WIN for both sides correctly (edge case in data)", () => {
    const entry = makeEntry({
      player1_result: "WIN",
      player2_result: "WIN",
    });
    const r1 = findMyData(entry, "Player1");
    const r2 = findMyData(entry, "Player2");
    expect(r1.myResult).toBe("WIN");
    expect(r2.myResult).toBe("WIN");
  });
});

// ============================================================
// calcWinRate
// ============================================================

describe("calcWinRate", () => {
  it("returns 0 when no games played", () => {
    expect(calcWinRate(0, 0)).toBe(0);
  });

  it("returns 100 when all wins", () => {
    expect(calcWinRate(10, 0)).toBe(100);
  });

  it("returns 0 when all losses", () => {
    expect(calcWinRate(0, 10)).toBe(0);
  });

  it("returns 50 for even record", () => {
    expect(calcWinRate(5, 5)).toBe(50);
  });

  it("rounds correctly (66.666... -> 67)", () => {
    expect(calcWinRate(2, 1)).toBe(67);
  });

  it("rounds correctly (33.333... -> 33)", () => {
    expect(calcWinRate(1, 2)).toBe(33);
  });

  it("handles single win", () => {
    expect(calcWinRate(1, 0)).toBe(100);
  });

  it("handles single loss", () => {
    expect(calcWinRate(0, 1)).toBe(0);
  });

  it("handles large numbers", () => {
    expect(calcWinRate(999, 1)).toBe(100); // 99.9 rounds to 100
  });

  it("handles 1 win 999 losses", () => {
    expect(calcWinRate(1, 999)).toBe(0); // 0.1 rounds to 0
  });

  it("returns 75 for 3:1 ratio", () => {
    expect(calcWinRate(3, 1)).toBe(75);
  });

  it("returns 25 for 1:3 ratio", () => {
    expect(calcWinRate(1, 3)).toBe(25);
  });
});

// ============================================================
// processNewEntries
// ============================================================

describe("processNewEntries", () => {
  it("returns empty when no username", () => {
    const entries = [makeEntry()];
    const result = processNewEntries(entries, null, "");
    expect(result.newEntries).toHaveLength(0);
    expect(result.newWins).toBe(0);
    expect(result.newLosses).toBe(0);
  });

  it("returns empty when no entries", () => {
    const result = processNewEntries([], null, "Player1");
    expect(result.newEntries).toHaveLength(0);
  });

  it("returns all entries when baseline is null", () => {
    const entries = [
      makeEntry({ date: "03/19/2026 21:33" }),
      makeEntry({ date: "03/19/2026 21:30" }),
    ];
    const result = processNewEntries(entries, null, "Player1");
    expect(result.newEntries).toHaveLength(2);
    expect(result.newWins).toBe(2);
    expect(result.newLosses).toBe(0);
  });

  it("returns entries newer than baseline", () => {
    const entries = [
      makeEntry({ date: "03/19/2026 21:35", player1_result: "WIN" }),
      makeEntry({ date: "03/19/2026 21:33", player1_result: "LOSE" }), // baseline
      makeEntry({ date: "03/19/2026 21:30" }),
    ];
    const result = processNewEntries(entries, "03/19/2026 21:33", "Player1");
    expect(result.newEntries).toHaveLength(1);
    expect(result.newWins).toBe(1);
    expect(result.newLosses).toBe(0);
  });

  it("returns empty when baseline is the newest entry", () => {
    const entries = [
      makeEntry({ date: "03/19/2026 21:33" }),
      makeEntry({ date: "03/19/2026 21:30" }),
    ];
    const result = processNewEntries(entries, "03/19/2026 21:33", "Player1");
    expect(result.newEntries).toHaveLength(0);
  });

  it("counts wins and losses correctly for player2", () => {
    const entries = [
      makeEntry({ date: "03/19/2026 21:35", player2_result: "WIN" }),
      makeEntry({ date: "03/19/2026 21:34", player2_result: "LOSE" }),
      makeEntry({ date: "03/19/2026 21:33" }), // baseline
    ];
    const result = processNewEntries(entries, "03/19/2026 21:33", "Player2");
    expect(result.newEntries).toHaveLength(2);
    expect(result.newWins).toBe(1);
    expect(result.newLosses).toBe(1);
  });

  it("handles multiple new wins", () => {
    const entries = [
      makeEntry({ date: "d3", player1_result: "WIN" }),
      makeEntry({ date: "d2", player1_result: "WIN" }),
      makeEntry({ date: "d1", player1_result: "WIN" }),
      makeEntry({ date: "d0" }), // baseline
    ];
    const result = processNewEntries(entries, "d0", "Player1");
    expect(result.newWins).toBe(3);
    expect(result.newLosses).toBe(0);
  });

  it("handles multiple new losses", () => {
    const entries = [
      makeEntry({ date: "d3", player1_result: "LOSE" }),
      makeEntry({ date: "d2", player1_result: "LOSE" }),
      makeEntry({ date: "d1" }), // baseline
    ];
    const result = processNewEntries(entries, "d1", "Player1");
    expect(result.newWins).toBe(0);
    expect(result.newLosses).toBe(2);
  });

  it("handles baseline not found in entries (all entries are new)", () => {
    const entries = [
      makeEntry({ date: "d3", player1_result: "WIN" }),
      makeEntry({ date: "d2", player1_result: "LOSE" }),
    ];
    const result = processNewEntries(entries, "d_old_baseline", "Player1");
    expect(result.newEntries).toHaveLength(2);
    expect(result.newWins).toBe(1);
    expect(result.newLosses).toBe(1);
  });

  it("handles single entry newer than baseline", () => {
    const entries = [
      makeEntry({ date: "d2", player1_result: "LOSE" }),
      makeEntry({ date: "d1" }), // baseline
    ];
    const result = processNewEntries(entries, "d1", "Player1");
    expect(result.newEntries).toHaveLength(1);
    expect(result.newLosses).toBe(1);
  });
});

// ============================================================
// parseCharacterLeagueData
// ============================================================

/** Wrapper for tests that pass raw API-shaped objects directly. */
function makeNextDataHtmlRaw(characterLeagueInfos: unknown[]): string {
  const nextData = {
    props: {
      pageProps: {
        play: {
          character_league_infos: characterLeagueInfos,
        },
      },
    },
  };
  return `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
}

describe("parseCharacterLeagueData", () => {
  it("extracts character name, league points, and master rating", () => {
    const html = makeNextDataHtmlRaw([
      {
        character_alpha: "KEN",
        league_info: { league_point: 22620, master_rating: 0 },
      },
      {
        character_alpha: "ZANGIEF",
        league_info: { league_point: 17838, master_rating: 0 },
      },
    ]);
    const result = parseCharacterLeagueData(html);
    expect(result).toEqual([
      { character: "KEN", leaguePoint: 22620, masterRate: 0 },
      { character: "ZANGIEF", leaguePoint: 17838, masterRate: 0 },
    ]);
  });

  it("handles master rating values", () => {
    const html = makeNextDataHtmlRaw([
      {
        character_alpha: "RYU",
        league_info: { league_point: 25000, master_rating: 1800 },
      },
    ]);
    const result = parseCharacterLeagueData(html);
    expect(result).toEqual([
      { character: "RYU", leaguePoint: 25000, masterRate: 1800 },
    ]);
  });

  it("treats league_point -1 as unplayed (returns -1)", () => {
    const html = makeNextDataHtmlRaw([
      {
        character_alpha: "LUKE",
        league_info: { league_point: -1, master_rating: 0 },
      },
    ]);
    const result = parseCharacterLeagueData(html);
    expect(result).toEqual([
      { character: "LUKE", leaguePoint: -1, masterRate: 0 },
    ]);
  });

  it("returns empty array when no __NEXT_DATA__ script found", () => {
    const html = "<html><body>no data</body></html>";
    const result = parseCharacterLeagueData(html);
    expect(result).toEqual([]);
  });

  it("returns empty array when character_league_infos is missing", () => {
    const nextData = { props: { pageProps: { play: {} } } };
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></html>`;
    const result = parseCharacterLeagueData(html);
    expect(result).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    const html = `<html><script id="__NEXT_DATA__" type="application/json">{broken json</script></html>`;
    const result = parseCharacterLeagueData(html);
    expect(result).toEqual([]);
  });

  it("handles multiple characters with mixed data", () => {
    const html = makeNextDataHtmlRaw([
      { character_alpha: "KEN", league_info: { league_point: 22620, master_rating: 0 } },
      { character_alpha: "RYU", league_info: { league_point: -1, master_rating: 0 } },
      { character_alpha: "JURI", league_info: { league_point: 30000, master_rating: 2100 } },
    ]);
    const result = parseCharacterLeagueData(html);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ character: "KEN", leaguePoint: 22620, masterRate: 0 });
    expect(result[1]).toEqual({ character: "RYU", leaguePoint: -1, masterRate: 0 });
    expect(result[2]).toEqual({ character: "JURI", leaguePoint: 30000, masterRate: 2100 });
  });

  it("handles empty character_league_infos array", () => {
    const html = makeNextDataHtmlRaw([]);
    const result = parseCharacterLeagueData(html);
    expect(result).toEqual([]);
  });
});

// ============================================================
// detectCharacterChange
// ============================================================

describe("detectCharacterChange", () => {
  it("detects LP change for a character", () => {
    const prev = [makeLeague("KEN", 22620, 0), makeLeague("RYU", -1, 0)];
    const curr = [makeLeague("KEN", 22400, 0), makeLeague("RYU", -1, 0)];
    const result = detectCharacterChange(prev, curr);
    expect(result).toEqual({ character: "KEN", currentLP: 22400, currentMR: 0 });
  });

  it("detects MR change for a character", () => {
    const prev = [makeLeague("JURI", 25000, 1800)];
    const curr = [makeLeague("JURI", 25000, 1850)];
    const result = detectCharacterChange(prev, curr);
    expect(result).toEqual({ character: "JURI", currentLP: 25000, currentMR: 1850 });
  });

  it("detects when both LP and MR change simultaneously", () => {
    const prev = [makeLeague("JURI", 25000, 1800)];
    const curr = [makeLeague("JURI", 25100, 1850)];
    const result = detectCharacterChange(prev, curr);
    expect(result).toEqual({ character: "JURI", currentLP: 25100, currentMR: 1850 });
  });

  it("returns null when nothing changed", () => {
    const prev = [makeLeague("KEN", 22620, 0), makeLeague("RYU", -1, 0)];
    const curr = [makeLeague("KEN", 22620, 0), makeLeague("RYU", -1, 0)];
    expect(detectCharacterChange(prev, curr)).toBeNull();
  });

  it("ignores LP change when LP is -1 (unplayed)", () => {
    const prev = [makeLeague("RYU", -1, 0)];
    const curr = [makeLeague("RYU", -1, 0)];
    expect(detectCharacterChange(prev, curr)).toBeNull();
  });

  it("ignores MR change when MR is 0", () => {
    const prev = [makeLeague("KEN", 22620, 0)];
    const curr = [makeLeague("KEN", 22620, 0)];
    expect(detectCharacterChange(prev, curr)).toBeNull();
  });

  it("detects change in second character when first is unchanged", () => {
    const prev = [makeLeague("KEN", 22620, 0), makeLeague("ZANGIEF", 17838, 0)];
    const curr = [makeLeague("KEN", 22620, 0), makeLeague("ZANGIEF", 17600, 0)];
    const result = detectCharacterChange(prev, curr);
    expect(result).toEqual({ character: "ZANGIEF", currentLP: 17600, currentMR: 0 });
  });

  it("returns first changed character when multiple change", () => {
    const prev = [makeLeague("KEN", 22620, 0), makeLeague("ZANGIEF", 17838, 0)];
    const curr = [makeLeague("KEN", 22800, 0), makeLeague("ZANGIEF", 17600, 0)];
    const result = detectCharacterChange(prev, curr);
    expect(result!.character).toBe("KEN");
  });

  it("handles empty arrays", () => {
    expect(detectCharacterChange([], [])).toBeNull();
  });

  it("handles new character not in previous", () => {
    const prev = [makeLeague("KEN", 22620, 0)];
    const curr = [makeLeague("KEN", 22620, 0), makeLeague("RYU", 5000, 0)];
    expect(detectCharacterChange(prev, curr)).toBeNull();
  });

  it("detects first ranked game (LP from -1 to positive)", () => {
    const prev = [makeLeague("RYU", -1, 0)];
    const curr = [makeLeague("RYU", 5000, 0)];
    const result = detectCharacterChange(prev, curr);
    expect(result).toEqual({ character: "RYU", currentLP: 5000, currentMR: 0 });
  });
});

// ============================================================
// pickDefaultCharacter
// ============================================================

describe("pickDefaultCharacter", () => {
  it("picks the character with the highest LP", () => {
    const data = [makeLeague("KEN", 22620, 0), makeLeague("ZANGIEF", 17838, 0)];
    expect(pickDefaultCharacter(data)!.character).toBe("KEN");
  });

  it("returns null when all characters are unplayed", () => {
    const data = [makeLeague("RYU", -1, 0), makeLeague("KEN", -1, 0)];
    expect(pickDefaultCharacter(data)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(pickDefaultCharacter([])).toBeNull();
  });

  it("ignores characters with LP <= 0", () => {
    const data = [makeLeague("RYU", -1, 0), makeLeague("KEN", 0, 0), makeLeague("JURI", 5000, 0)];
    expect(pickDefaultCharacter(data)!.character).toBe("JURI");
  });

  it("picks highest LP even when another has higher MR", () => {
    const data = [makeLeague("JURI", 25000, 1800), makeLeague("KEN", 30000, 0)];
    expect(pickDefaultCharacter(data)!.character).toBe("KEN");
  });
});

// ============================================================
// Edge cases: processNewEntries with non-WIN results
// ============================================================

describe("processNewEntries edge cases", () => {
  it("counts non-WIN result (e.g. DRAW) as a loss", () => {
    const entries = [
      makeEntry({ date: "d2", player1_result: "DRAW" }),
      makeEntry({ date: "d1" }),
    ];
    const result = processNewEntries(entries, "d1", "Player1");
    expect(result.newWins).toBe(0);
    expect(result.newLosses).toBe(1);
  });
});

// ============================================================
// Edge cases: parseCharacterLeagueData with missing fields
// ============================================================

describe("parseCharacterLeagueData edge cases", () => {
  it("throws/returns empty when league_info is missing", () => {
    const html = makeNextDataHtmlRaw([
      { character_alpha: "KEN" },
    ]);
    const result = parseCharacterLeagueData(html);
    expect(result).toEqual([]);
  });

  it("throws/returns empty when league_point is missing", () => {
    const html = makeNextDataHtmlRaw([
      { character_alpha: "KEN", league_info: { master_rating: 0 } },
    ]);
    const result = parseCharacterLeagueData(html);
    expect(result).toHaveLength(1);
    expect(result[0].leaguePoint).toBeUndefined();
  });
});

// ============================================================
// Edge cases: calcWinRate with negative input
// ============================================================

describe("calcWinRate edge cases", () => {
  it("returns 0 when negative input cancels total to zero", () => {
    // -1 + 1 = 0 total → hits the zero guard
    expect(calcWinRate(-1, 1)).toBe(0);
  });

  it("does not crash on negative inputs with nonzero total", () => {
    // -1 + 3 = 2 total → Math.round(-1/2 * 100) = -50
    expect(calcWinRate(-1, 3)).toBe(-50);
  });
});
