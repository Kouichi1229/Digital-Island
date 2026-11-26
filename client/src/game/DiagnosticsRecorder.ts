export type UpdateDiagnostic = {
  sequence: number;
  timestamp: string;
  realTimestamp: number;
  intervalMs: number | null;
  visibilityState: DocumentVisibilityState;
};

export type VisibilityDiagnostic = {
  timestamp: string;
  realTimestamp: number;
  visibilityState: DocumentVisibilityState;
};

const updateDiagnostics: UpdateDiagnostic[] = [];

const visibilityDiagnostics: VisibilityDiagnostic[] = [
  {
    timestamp: new Date().toISOString(),
    realTimestamp: Date.now(),
    visibilityState: document.visibilityState,
  },
];

document.addEventListener("visibilitychange", () => {
  const now = Date.now();

  visibilityDiagnostics.push({
    timestamp: new Date(now).toISOString(),
    realTimestamp: now,
    visibilityState: document.visibilityState,
  });
});

let updateSequence = 0;
let lastUpdateTimestamp: number | null = null;

export function recordUpdateDiagnostic() {
  const now = Date.now();

  updateSequence += 1;

  const intervalMs =
    lastUpdateTimestamp === null ? null : now - lastUpdateTimestamp;

  updateDiagnostics.push({
    sequence: updateSequence,
    timestamp: new Date(now).toISOString(),
    realTimestamp: now,
    intervalMs,
    visibilityState: document.visibilityState,
  });

  lastUpdateTimestamp = now;
}

export function downloadUpdateDiagnostics() {
  const log = {
    startedAt:
      updateDiagnostics.length > 0 ? updateDiagnostics[0].timestamp : null,
    endedAt: new Date().toISOString(),
    summary: {
      updateCount: updateDiagnostics.length,
      visibilityEventCount: visibilityDiagnostics.length,
      maxIntervalMs: Math.max(
        0,
        ...updateDiagnostics.map((item) => item.intervalMs ?? 0),
      ),
    },
    updates: updateDiagnostics,
    visibilityEvents: visibilityDiagnostics,
  };

  const blob = new Blob([JSON.stringify(log, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `digital-island-update-diagnostics-${Date.now()}.json`;

  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
