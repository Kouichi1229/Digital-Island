import { useEffect, useState } from "react";
import GameCanvas from "./components/GameCanvas";
import DialogueBox from "./components/DialogueBox";
import { gameClock, type GameTimeSnapshot } from "./game/GameClock";
import "./App.css";

function App() {
  const [dialogueCollapsed, setDialogueCollapsed] = useState(false);
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
            <GameCanvas />

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
