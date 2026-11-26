import type { EnvironmentSnapshot } from "./EnvironmentPerception";

export type LumiRecordingState = {
  x: number;
  y: number;
  direction: string;
  isMoving: boolean;
  gameTime: string;
};

export type EnvironmentRecording = {
  timestamp: string;
  lumi: LumiRecordingState;
  environment: EnvironmentSnapshot;
  diagnostics: {
    sequence: number;
    realTimestamp: number;
    intervalMs: number | null;
    visibilityState: DocumentVisibilityState;
  };
};

export type CollisionRecording = {
  timestamp: string;
  gameTime: string;
  lumiX: number;
  lumiY: number;
  targetType: string;
  layer?: string;
  tileIndex?: number;
  targetX?: number;
  targetY?: number;
};

export type EnvironmentLog = {
  startedAt: string;
  snapshots: EnvironmentRecording[];
  collisions: CollisionRecording[];
};

const environmentLog: EnvironmentLog = {
  startedAt: new Date().toISOString(),
  snapshots: [],
  collisions: [],
};

let snapshotSequence = 0;
let lastSnapshotTimestamp: number | null = null;

export function recordEnvironment(
  lumi: LumiRecordingState,
  environment: EnvironmentSnapshot,
) {
  const now = Date.now();

  snapshotSequence += 1;

  const intervalMs =
    lastSnapshotTimestamp === null ? null : now - lastSnapshotTimestamp;

  environmentLog.snapshots.push({
    timestamp: new Date(now).toISOString(),
    lumi: { ...lumi },
    environment,
    diagnostics: {
      sequence: snapshotSequence,
      realTimestamp: now,
      intervalMs,
      visibilityState: document.visibilityState,
    },
  });

  lastSnapshotTimestamp = now;
}

export function recordCollision(collision: CollisionRecording) {
  environmentLog.collisions.push(collision);
}

export function downloadEnvironmentLog() {
  const log = {
    ...environmentLog,
    endedAt: new Date().toISOString(),
    summary: {
      snapshotCount: environmentLog.snapshots.length,
      collisionCount: environmentLog.collisions.length,
    },
  };

  const json = JSON.stringify(log, null, 2);

  const blob = new Blob([json], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `digital-island-environment-${Date.now()}.json`;

  link.click();

  URL.revokeObjectURL(url);
}
