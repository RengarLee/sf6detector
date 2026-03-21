import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import "./App.css";
import {
  type MatchData,
  type RustBattleEntry,
  findMyData,
  calcWinRate,
  processNewEntries,
  updateStatsWithNewEntries,
  initializeBaseline,
} from "./utils";


// 动画滚动数字组件
function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    let start = displayValue;
    const end = value;
    if (start === end) return;

    const duration = 500;
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easing = progress === 1 ? 1 : 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(start + (end - start) * easing));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <span>{displayValue}</span>;
}

function App() {
  const [cfnId, setCfnId] = useState(() => localStorage.getItem("sf6_cfn_id") || "");
  const [isPolling, setIsPolling] = useState(() => !!localStorage.getItem("sf6_cfn_id"));
  const [status, setStatus] = useState("Idle");
  const [stats, setStats] = useState<MatchData>({
    mr: { current: 0, initial: 0 },
    lp: { current: 0, initial: 0 },
    wins: 0, losses: 0,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [scoreType, setScoreType] = useState<"MR" | "LP">("MR");
  const [alwaysOnTop] = useState(() => localStorage.getItem("sf6_top") === "true");
  const [loginStatus, setLoginStatus] = useState<"idle" | "logging_in" | "logged_in">("idle");

  const username = useRef<string | null>(null);
  const baselineDate = useRef<string | null>(null);

  useEffect(() => {
    localStorage.setItem("sf6_top", alwaysOnTop ? "true" : "false");
    getCurrentWindow().setAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);

  // Listen for auto-detected User Code from login window
  useEffect(() => {
    const unlisten = listen<string>("cfn_user_code_detected", (event) => {
      const detectedCode = event.payload;
      console.log("Auto-detected User Code:", detectedCode);
      if (detectedCode) {
        setCfnId(detectedCode);
        localStorage.setItem("sf6_cfn_id", detectedCode);
        setLoginStatus("logged_in");
        setStatus("✅ User Code detected: " + detectedCode);
        setIsPolling(true); // Automatically start tracking!
      }
    });
    return () => { unlisten.then(f => f()); };
  }, [cfnId]);

  // Listen for parsed battlelog data from Rust
  useEffect(() => {
    const unlisten = listen<{ username: string | null; entries: RustBattleEntry[] }>("battlelog_update", (event) => {
      const { username: parsedUsername, entries } = event.payload;
      console.log("Battlelog update:", parsedUsername, entries.length, "entries");

      // Save username on first detect
      if (parsedUsername && !username.current) {
        username.current = parsedUsername;
        console.log("Username set:", parsedUsername);
      }

      if (!username.current || entries.length === 0) return;

      // First time: set baseline from latest entry
      if (baselineDate.current === null) {
        const latest = entries[0];
        const { myScore, myScoreType } = findMyData(latest, username.current);
        baselineDate.current = latest.date;
        setStats(prev => initializeBaseline(prev, myScore, myScoreType));
        console.log("Baseline set:", latest.date, myScoreType, myScore);
        return;
      }

      const { newEntries, newWins, newLosses } = processNewEntries(entries, baselineDate.current, username.current);
      if (newEntries.length === 0) return;

      // Latest entry has the current score
      const { myScore: currentScore, myScoreType: latestType } = findMyData(newEntries[0], username.current);

      // Update baseline to newest
      baselineDate.current = newEntries[0].date;

      setStats(prev => updateStatsWithNewEntries(prev, newWins, newLosses, currentScore, latestType));

      console.log(`Processed ${newEntries.length} new battles. ${latestType}: ${currentScore}`);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  // Poller - fetch both profile and battlelog
  useEffect(() => {
    if (!isPolling || !cfnId) return;

    localStorage.setItem("sf6_cfn_id", cfnId);
    getCurrentWindow().setSize(new LogicalSize(475, 175)).catch(console.error);

    const fetchData = () => {
      // Fetch battlelog page — Rust parses HTML and emits battlelog_update event
      invoke("fetch_buckler_data", {
        endpoint: `https://www.streetfighter.com/6/buckler/profile/${cfnId}/battlelog`
      }).catch(err => console.error("Battlelog fetch failed:", err));
    };

    // Initial fetch
    fetchData();

    // Poll every 15 seconds
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [isPolling, cfnId]);

  const handleLogin = () => {
    invoke("open_login_window");
    setLoginStatus("logging_in");
    setStatus("🔐 Please login in the popup window...");
  };

  const winRate = calcWinRate(stats.wins, stats.losses);

  return (
    <>
      {/* 隐形拖动层 */}
      <div className="drag-region" data-tauri-drag-region></div>

      <div className="container">
        <div className="top-bar">
          <div className="top-bar-left">
            {isPolling && (
              <div className="stats-top-row">
                <span className="stat-item">Total: {stats.wins + stats.losses}</span>
                <span className="stat-separator">|</span>
                <span className="stat-item">W: {stats.wins}</span>
                <span className="stat-separator">|</span>
                <span className="stat-item">L: {stats.losses}</span>
                <span className="stat-separator">|</span>
                <span className="stat-item">WR: {winRate}%</span>
              </div>
            )}
          </div>
          <div className="top-bar-right">
            <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Settings">
              ⚙️
            </button>
            <button className="btn-icon" onClick={() => getCurrentWindow().close()} title="Exit">
              ✕
            </button>
          </div>
          {showSettings && (
            <div className="settings-menu">
              <button className="btn-primary menu-btn" onClick={() => {
                setScoreType(scoreType === "MR" ? "LP" : "MR");
                setShowSettings(false);
              }}>Switch to {scoreType === "MR" ? "LP" : "MR"}</button>
              {isPolling && (
                <>
                  <button className="btn-primary menu-btn" onClick={() => {
                    setStats({ mr: { current: 0, initial: 0 }, lp: { current: 0, initial: 0 }, wins: 0, losses: 0 });
                    baselineDate.current = null;
                    setShowSettings(false);
                  }}>Reset Session</button>
                  <button className="btn-danger menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                    setIsPolling(false);
                    baselineDate.current = null;
                    setShowSettings(false);
                  }}>Stop Tracking</button>
                  {import.meta.env.DEV && (
                    <>
                      <button className="btn-mock menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                        setStats(prev => ({ ...prev, mr: { current: 1500, initial: 1500 }, lp: { current: 25000, initial: 25000 } }));
                        setShowSettings(false);
                      }}>Set Default Scores</button>
                      <button className="btn-success menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                        const delta = Math.floor(Math.random() * 30) + 20;
                        setStats(prev => ({ ...prev, wins: prev.wins + 1, mr: { ...prev.mr, current: prev.mr.current + delta } }));
                        setShowSettings(false);
                      }}>Mock Win (MR)</button>
                      <button className="btn-danger menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                        const delta = Math.floor(Math.random() * 30) + 20;
                        setStats(prev => ({ ...prev, losses: prev.losses + 1, mr: { ...prev.mr, current: prev.mr.current - delta } }));
                        setShowSettings(false);
                      }}>Mock Loss (MR)</button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {!isPolling ? (
          <div className="setup-section">
            <h1 className="title">SF6Detector Setup</h1>
            <button className="btn-primary" onClick={handleLogin}>
              {loginStatus === "logged_in" ? "✅ Logged In" : "1. Login to CFN"}
            </button>
            <div className="input-group">
              <input
                type="text"
                placeholder="Enter CFN User Code"
                value={cfnId}
                onChange={(e) => setCfnId(e.target.value)}
                className="input-cfn"
              />
              <button
                className="btn-success"
                onClick={() => setIsPolling(true)}
                disabled={!cfnId}
              >
                2. Start Tracking
              </button>
            </div>
            <p className="status-text">{status}</p>
          </div>
        ) : (
          <div className="dashboard">
            {(() => {
              const s = scoreType === "MR" ? stats.mr : stats.lp;
              const change = s.current - s.initial;
              return (
                <div className="score-main">
                  <div className="mr-value">
                    <AnimatedNumber value={s.current} />
                    <span style={{ fontSize: "min(16vh, 5vw)", color: "var(--text-muted)", marginLeft: "0.5vw" }}>{scoreType}</span>
                  </div>
                  <div className={`mr-change ${change >= 0 ? 'positive' : 'negative'}`}>
                    {change >= 0 ? "+" : ""}
                    <AnimatedNumber value={change} />
                  </div>
                </div>
              );
            })()}

          </div>
        )}
      </div>
    </>
  );
}

export default App;
