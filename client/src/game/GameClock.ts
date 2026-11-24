
export type DayPeriod = '清晨' | '白天' | '黃昏' | '夜晚'

export type GameTimeSnapshot = {
  hours: number
  minutes: number
  totalMinutes: number
  period: DayPeriod
  formattedTime: string
}

type Listener = (snapshot: GameTimeSnapshot) => void

const INITIAL_MINUTES = 6 * 60
const GAME_MINUTES_PER_REAL_MINUTE = 15

class GameClock {
  private totalMinutes = INITIAL_MINUTES
  private lastPublishedMinute = INITIAL_MINUTES
  private lastRealTimestamp = Date.now()
  private listeners = new Set<Listener>()

  getSnapshot(): GameTimeSnapshot {
    const totalMinutes =
      ((this.totalMinutes % 1440) + 1440) % 1440

    const displayMinutes = Math.floor(totalMinutes)
    const hours = Math.floor(displayMinutes / 60)
    const minutes = displayMinutes % 60

    let period: DayPeriod

    if (hours >= 6 && hours < 9) {
      period = '清晨'
    } else if (hours >= 9 && hours < 17) {
      period = '白天'
    } else if (hours >= 17 && hours < 19) {
      period = '黃昏'
    } else {
      period = '夜晚'
    }

    return {
      hours,
      minutes,
      totalMinutes,
      period,
      formattedTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    }
  }

  advanceTo(timestamp = Date.now()) {
    const deltaMs = Math.max(0, timestamp - this.lastRealTimestamp)
    this.lastRealTimestamp = timestamp

    if (deltaMs === 0) {
      return
    }

    this.totalMinutes +=
      (deltaMs / 60000) * GAME_MINUTES_PER_REAL_MINUTE

    const currentMinute = Math.floor(this.totalMinutes)

    if (currentMinute !== this.lastPublishedMinute) {
      this.lastPublishedMinute = currentMinute
      this.notify()
    }
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    const snapshot = this.getSnapshot()

    this.listeners.forEach((listener) => {
      listener(snapshot)
    })
  }
}

export const gameClock = new GameClock()
