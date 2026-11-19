import GameCanvas from './components/GameCanvas'
import './App.css'

function App() {
  return (
    <main className="app">
      <header className="app-header">
        <h1>Digital Island</h1>
        <p>AI Autonomous Life Simulation</p>
      </header>

      <section className="game-section">
        <GameCanvas />
      </section>
    </main>
  )
}

export default App
