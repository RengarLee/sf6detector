import { describe, it, expect } from "vitest";
import {
  findMyData,
  calcWinRate,
  processNewEntries,
  updateStatsWithNewEntries,
  initializeBaseline,
  type RustBattleEntry,
  type MatchData,
} from "./utils";

// ============================================================
// Helper factory
// ============================================================

function makeEntry(overrides: Partial<RustBattleEntry> = {}): RustBattleEntry {
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

function makeStats(overrides: Partial<MatchData> = {}): MatchData {
  return {
    mr: { current: 0, initial: 0 },
    lp: { current: 0, initial: 0 },
    wins: 0,
    losses: 0,
    ...overrides,
  };
}

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
// updateStatsWithNewEntries
// ============================================================

describe("updateStatsWithNewEntries", () => {
  it("adds wins and losses to previous stats", () => {
    const prev = makeStats({ wins: 5, losses: 3 });
    const result = updateStatsWithNewEntries(prev, 2, 1, 16000, "LP");
    expect(result.wins).toBe(7);
    expect(result.losses).toBe(4);
  });

  it("updates LP current score", () => {
    const prev = makeStats({ lp: { current: 15000, initial: 14000 } });
    const result = updateStatsWithNewEntries(prev, 1, 0, 16000, "LP");
    expect(result.lp.current).toBe(16000);
    expect(result.lp.initial).toBe(14000); // unchanged
  });

  it("updates MR current score", () => {
    const prev = makeStats({ mr: { current: 1500, initial: 1400 } });
    const result = updateStatsWithNewEntries(prev, 1, 0, 1600, "MR");
    expect(result.mr.current).toBe(1600);
    expect(result.mr.initial).toBe(1400); // unchanged
  });

  it("sets LP initial when it was 0", () => {
    const prev = makeStats({ lp: { current: 0, initial: 0 } });
    const result = updateStatsWithNewEntries(prev, 1, 0, 12000, "LP");
    expect(result.lp.current).toBe(12000);
    expect(result.lp.initial).toBe(12000);
  });

  it("sets MR initial when it was 0", () => {
    const prev = makeStats({ mr: { current: 0, initial: 0 } });
    const result = updateStatsWithNewEntries(prev, 1, 0, 1500, "MR");
    expect(result.mr.current).toBe(1500);
    expect(result.mr.initial).toBe(1500);
  });

  it("does not change MR when updating LP", () => {
    const prev = makeStats({ mr: { current: 1500, initial: 1400 } });
    const result = updateStatsWithNewEntries(prev, 1, 0, 16000, "LP");
    expect(result.mr.current).toBe(1500);
    expect(result.mr.initial).toBe(1400);
  });

  it("does not change LP when updating MR", () => {
    const prev = makeStats({ lp: { current: 15000, initial: 14000 } });
    const result = updateStatsWithNewEntries(prev, 1, 0, 1600, "MR");
    expect(result.lp.current).toBe(15000);
    expect(result.lp.initial).toBe(14000);
  });

  it("handles zero new wins and losses", () => {
    const prev = makeStats({ wins: 5, losses: 3 });
    const result = updateStatsWithNewEntries(prev, 0, 0, 15000, "LP");
    expect(result.wins).toBe(5);
    expect(result.losses).toBe(3);
  });

  it("handles score decrease (loss)", () => {
    const prev = makeStats({ lp: { current: 15000, initial: 15000 } });
    const result = updateStatsWithNewEntries(prev, 0, 1, 14800, "LP");
    expect(result.lp.current).toBe(14800);
    expect(result.lp.initial).toBe(15000);
  });

  it("does not overwrite non-zero initial", () => {
    const prev = makeStats({ lp: { current: 15000, initial: 14000 } });
    const result = updateStatsWithNewEntries(prev, 1, 0, 16000, "LP");
    expect(result.lp.initial).toBe(14000); // stays at 14000, not overwritten
  });

  it("preserves immutability (does not mutate prev)", () => {
    const prev = makeStats({ wins: 5, lp: { current: 15000, initial: 14000 } });
    const prevCopy = JSON.parse(JSON.stringify(prev));
    updateStatsWithNewEntries(prev, 1, 0, 16000, "LP");
    expect(prev).toEqual(prevCopy);
  });
});

// ============================================================
// initializeBaseline
// ============================================================

describe("initializeBaseline", () => {
  it("sets MR current and initial to same value", () => {
    const prev = makeStats();
    const result = initializeBaseline(prev, 1500, "MR");
    expect(result.mr.current).toBe(1500);
    expect(result.mr.initial).toBe(1500);
  });

  it("sets LP current and initial to same value", () => {
    const prev = makeStats();
    const result = initializeBaseline(prev, 15000, "LP");
    expect(result.lp.current).toBe(15000);
    expect(result.lp.initial).toBe(15000);
  });

  it("does not affect LP when setting MR baseline", () => {
    const prev = makeStats({ lp: { current: 12000, initial: 11000 } });
    const result = initializeBaseline(prev, 1500, "MR");
    expect(result.lp.current).toBe(12000);
    expect(result.lp.initial).toBe(11000);
  });

  it("does not affect MR when setting LP baseline", () => {
    const prev = makeStats({ mr: { current: 1500, initial: 1400 } });
    const result = initializeBaseline(prev, 15000, "LP");
    expect(result.mr.current).toBe(1500);
    expect(result.mr.initial).toBe(1400);
  });

  it("overwrites existing values", () => {
    const prev = makeStats({ mr: { current: 1500, initial: 1400 } });
    const result = initializeBaseline(prev, 1800, "MR");
    expect(result.mr.current).toBe(1800);
    expect(result.mr.initial).toBe(1800);
  });

  it("handles zero score", () => {
    const prev = makeStats();
    const result = initializeBaseline(prev, 0, "LP");
    expect(result.lp.current).toBe(0);
    expect(result.lp.initial).toBe(0);
  });

  it("preserves wins and losses", () => {
    const prev = makeStats({ wins: 10, losses: 5 });
    const result = initializeBaseline(prev, 1500, "MR");
    expect(result.wins).toBe(10);
    expect(result.losses).toBe(5);
  });

  it("preserves immutability (does not mutate prev)", () => {
    const prev = makeStats({ mr: { current: 1500, initial: 1400 } });
    const prevCopy = JSON.parse(JSON.stringify(prev));
    initializeBaseline(prev, 1800, "MR");
    expect(prev).toEqual(prevCopy);
  });
});
