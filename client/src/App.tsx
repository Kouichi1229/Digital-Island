import { useEffect, useState } from "react";
import GameCanvas from "./components/GameCanvas";
import type { LumiSnapshot } from "./game/scenes/IslandScene";
import DialogueBox from "./components/DialogueBox";
import { gameClock, type GameTimeSnapshot } from "./game/GameClock";
import { downloadEnvironmentLog } from "./game/EnvironmentRecorder";
import { downloadUpdateDiagnostics } from "./game/DiagnosticsRecorder";
import "./App.css";

function App() {
  const [dialogueCollapsed, setDialogueCollapsed] = useState(false);

  const [lumiSnapshot, setLumiSnapshot] = useState<LumiSnapshot | null>(null);
  const [gameTime, setGameTime] = useState<GameTimeSnapshot>(() =>
    gameClock.getSnapshot(),
  );

  useEffect(() => {
    return gameClock.subscribe(setGameTime);
  }, []);

  const periodIcon = {
    清晨: "🌅",
    白天: "☀️",
    黃昏: "🌇",
    夜晚: "🌙",
  }[gameTime.period];

  return (
    <main className="app">
      <header className="app-header">
        <h1>Digital Island</h1>
        <p>AI Autonomous Life Simulation</p>
      </header>

      <section className="game-section">
        <div className="game-layout">
          <div className="game-map">
            <GameCanvas onLumiSnapshot={setLumiSnapshot} />
            <button
              type="button"
              onClick={downloadEnvironmentLog}
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                zIndex: 1001,
                padding: "8px 12px",
                background: "#172238",
                color: "#ffffff",
                border: "1px solid #9bb5d3",
                cursor: "pointer",
              }}
            >
              匯出感知紀錄
            </button>
            <button
              type="button"
              onClick={downloadUpdateDiagnostics}
              style={{
                position: "absolute",
                top: 16,
                left: 140,
                zIndex: 1001,
                padding: "8px 12px",
                background: "#172238",
                color: "#ffffff",
                border: "1px solid #9bb5d3",
                cursor: "pointer",
              }}
            >
              匯出 Update 診斷
            </button>

            {lumiSnapshot && (
              <div
                style={{
                  position: "fixed",
                  left: 16,
                  bottom: 16,
                  zIndex: 1000,
                  padding: 12,
                  background: "#172238",
                  color: "#ffffff",
                  fontSize: 12,
                  fontFamily: "monospace",
                }}
              >
                <div>Lumi Snapshot</div>
                <div>X: {lumiSnapshot.x.toFixed(1)}</div>
                <div>Y: {lumiSnapshot.y.toFixed(1)}</div>
                <div>Direction: {lumiSnapshot.direction}</div>
                <div>Moving: {String(lumiSnapshot.isMoving)}</div>
                <div>Game Time: {lumiSnapshot.gameTime}</div>
              </div>
            )}

            <div className="game-time">
              <span className="game-time__label">島嶼時間</span>
              <span className="game-time__clock">{gameTime.formattedTime}</span>
              <span className="game-time__period">
                {periodIcon} {gameTime.period}
              </span>
            </div>
          </div>

          <DialogueBox
            collapsed={dialogueCollapsed}
            onToggle={() => setDialogueCollapsed((prev) => !prev)}
          />
        </div>
      </section>
    </main>
  );
}

export default App;
