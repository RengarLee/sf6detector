import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import "./App.css";
import {
  type RustBattleEntry,
  type CharacterLeagueData,
  findMyData,
  calcWinRate,
  processNewEntries,
  parseCharacterLeagueData,
  detectCharacterChange,
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
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [scoreType, setScoreType] = useState<"LP" | "MR">("LP");
  const [alwaysOnTop] = useState(() => localStorage.getItem("sf6_top") === "true");
  const [loginStatus, setLoginStatus] = useState<"idle" | "logging_in" | "logged_in">("idle");

  // Score display state — both LP and MR tracked simultaneously
  const [activeCharacter, setActiveCharacter] = useState<string | null>(null);
  const [currentLP, setCurrentLP] = useState(0);
  const [initialLP, setInitialLP] = useState(0);
  const [currentMR, setCurrentMR] = useState(0);
  const [initialMR, setInitialMR] = useState(0);

  // Play page tracking refs
  const initialLeagueData = useRef<CharacterLeagueData[] | null>(null);
  const previousLeagueData = useRef<CharacterLeagueData[] | null>(null);

  // Battlelog tracking refs
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
        setStatus("User Code detected: " + detectedCode);
        setIsPolling(true);
      }
    });
    return () => { unlisten.then(f => f()); };
  }, [cfnId]);

  // Listen for battlelog data — only update wins/losses
  useEffect(() => {
    const unlisten = listen<{ username: string | null; entries: RustBattleEntry[] }>("battlelog_update", (event) => {
      const { username: parsedUsername, entries } = event.payload;
      console.log("Battlelog update:", parsedUsername, entries.length, "entries");

      if (parsedUsername && !username.current) {
        username.current = parsedUsername;
        console.log("Username set:", parsedUsername);
      }

      if (!username.current || entries.length === 0) return;

      // First time: just set baseline date
      if (baselineDate.current === null) {
        baselineDate.current = entries[0].date;
        console.log("Battlelog baseline set:", entries[0].date);
        return;
      }

      const { newEntries, newWins, newLosses } = processNewEntries(entries, baselineDate.current, username.current);
      if (newEntries.length === 0) return;

      baselineDate.current = newEntries[0].date;
      setWins(prev => prev + newWins);
      setLosses(prev => prev + newLosses);

      console.log(`Processed ${newEntries.length} new battles. +${newWins}W +${newLosses}L`);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  // Listen for play page data — detect score changes
  useEffect(() => {
    const unlisten = listen<string>("buckler_data_received", (event) => {
      try {
        const data = JSON.parse(event.payload);
        if (!data.html) return;

        const leagueData = parseCharacterLeagueData(data.html);
        if (leagueData.length === 0) return;

        // First time: set both initial and previous, display highest LP character
        if (initialLeagueData.current === null) {
          initialLeagueData.current = leagueData;
          previousLeagueData.current = leagueData;

          const best = leagueData
            .filter(c => c.leaguePoint > 0)
            .sort((a, b) => b.leaguePoint - a.leaguePoint)[0];
          if (best) {
            setActiveCharacter(best.character);
            setCurrentLP(best.leaguePoint);
            setInitialLP(best.leaguePoint);
            setCurrentMR(best.masterRate);
            setInitialMR(best.masterRate);
          }

          console.log("Play page baseline set:", leagueData.length, "characters", best ? `default: ${best.character}` : "");
          return;
        }

        // Compare with previous to detect which character changed
        const change = detectCharacterChange(previousLeagueData.current!, leagueData);
        previousLeagueData.current = leagueData;

        if (!change) return;

        // Find initial scores for this character
        const initialEntry = initialLeagueData.current.find(c => c.character === change.character);
        const initLP = initialEntry ? initialEntry.leaguePoint : change.currentLP;
        const initMR = initialEntry ? initialEntry.masterRate : change.currentMR;

        setActiveCharacter(change.character);
        setCurrentLP(change.currentLP);
        setInitialLP(initLP);
        setCurrentMR(change.currentMR);
        setInitialMR(initMR);

        console.log(`Score change: ${change.character} LP:${change.currentLP}(init:${initLP}) MR:${change.currentMR}(init:${initMR})`);
      } catch {
        // Not play page data, ignore
      }
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  // Poller — fetch both battlelog and play page
  useEffect(() => {
    if (!isPolling || !cfnId) return;

    localStorage.setItem("sf6_cfn_id", cfnId);
    getCurrentWindow().setSize(new LogicalSize(475, 175)).catch(console.error);

    const fetchData = () => {
      invoke("fetch_buckler_data", {
        endpoint: `https://www.streetfighter.com/6/buckler/profile/${cfnId}/battlelog`
      }).catch(err => console.error("Battlelog fetch failed:", err));

      invoke("fetch_buckler_data", {
        endpoint: `https://www.streetfighter.com/6/buckler/profile/${cfnId}/play`
      }).catch(err => console.error("Play page fetch failed:", err));
    };

    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => {
      clearInterval(interval);
      getCurrentWindow().setSize(new LogicalSize(400, 300)).catch(console.error);
    };
  }, [isPolling, cfnId]);

  const handleLogin = () => {
    invoke("open_login_window");
    setLoginStatus("logging_in");
    setStatus("Please login in the popup window...");
  };

  const handleReset = () => {
    setWins(0);
    setLosses(0);
    setActiveCharacter(null);
    setCurrentLP(0);
    setInitialLP(0);
    setCurrentMR(0);
    setInitialMR(0);
    baselineDate.current = null;
    initialLeagueData.current = null;
    previousLeagueData.current = null;
    setShowSettings(false);
  };

  const winRate = calcWinRate(wins, losses);
  const mainScore = scoreType === "LP" ? currentLP : currentMR;
  const scoreChange = scoreType === "LP" ? currentLP - initialLP : currentMR - initialMR;

  return (
    <>
      {/* 隐形拖动层 */}
      <div className="drag-region" data-tauri-drag-region></div>

      <div className="container">
        <div className="top-bar">
          <div className="top-bar-left">
            {isPolling && (
              <div className="stats-top-row">
                <span className="stat-item">Total: {wins + losses}</span>
                <span className="stat-separator">|</span>
                <span className="stat-item">W: {wins}</span>
                <span className="stat-separator">|</span>
                <span className="stat-item">L: {losses}</span>
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
                setScoreType(scoreType === "LP" ? "MR" : "LP");
                setShowSettings(false);
              }}>Switch to {scoreType === "LP" ? "MR" : "LP"}</button>
              <button className="btn-primary menu-btn" onClick={() => {
                invoke("open_community_window");
                setShowSettings(false);
              }}>Community / 社区</button>
              {isPolling && (
                <>
                  <button className="btn-primary menu-btn" onClick={handleReset}>Reset Session</button>
                  <button className="btn-danger menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                    setIsPolling(false);
                    handleReset();
                  }}>Stop Tracking</button>
                  {import.meta.env.DEV && (
                    <>
                      <button className="btn-mock menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                        setActiveCharacter("KEN");
                        setCurrentLP(25000);
                        setInitialLP(25000);
                        setCurrentMR(1500);
                        setInitialMR(1500);
                        setShowSettings(false);
                      }}>Set Default Scores</button>
                      <button className="btn-success menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                        setWins(prev => prev + 1);
                        setCurrentLP(prev => prev + (Math.floor(Math.random() * 100) + 50));
                        setCurrentMR(prev => prev + (Math.floor(Math.random() * 30) + 20));
                        setShowSettings(false);
                      }}>Mock Win</button>
                      <button className="btn-danger menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                        setLosses(prev => prev + 1);
                        setCurrentLP(prev => prev - (Math.floor(Math.random() * 100) + 50));
                        setCurrentMR(prev => prev - (Math.floor(Math.random() * 30) + 20));
                        setShowSettings(false);
                      }}>Mock Loss</button>
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
              {loginStatus === "logged_in" ? "Logged In" : "Login to CFN"}
            </button>
            {cfnId && (
              <p className="status-text">User Code: {cfnId}</p>
            )}
            <p className="status-text">{status}</p>
          </div>
        ) : (
          <div className="dashboard">
            <div className="score-main">
              <div className="mr-value">
                <AnimatedNumber value={mainScore} />
                <span style={{ fontSize: "min(16vh, 5vw)", color: "var(--text-muted)", marginLeft: "0.5vw" }}>{scoreType}</span>
              </div>
              <div className={`mr-change ${scoreChange >= 0 ? 'positive' : 'negative'}`}>
                {scoreChange >= 0 ? "+" : ""}<AnimatedNumber value={scoreChange} />
              </div>
            </div>
          </div>
        )}
      </div>

    </>
  );
}

export default App;
