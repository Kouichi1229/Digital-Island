import { useEffect } from "react";
import Phaser from "phaser";
import { gameConfig } from "../game/config";
import type {
  IslandScene,
  LumiSnapshot,
  LumiActionExecution,
} from "../game/scenes/IslandScene";

type GameCanvasProps = {
  onLumiSnapshot?: (snapshot: LumiSnapshot) => void;
};

function GameCanvas({ onLumiSnapshot }: GameCanvasProps) {
  useEffect(() => {
    const game = new Phaser.Game(gameConfig);

    let disposed = false;
    let autonomyStopped = false;
    let cycleBusy = false;
    let recoveryMonitor: ReturnType<typeof setInterval> | null = null;
    let islandScene: IslandScene | null = null;

    async function requestNextAction(
      scene: IslandScene,
      snapshot: LumiSnapshot,
    ): Promise<void> {
      if (disposed || autonomyStopped || cycleBusy) {
        return;
      }

      cycleBusy = true;

      try {
        const response = await fetch("/api/lumi/decide", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            observation: JSON.stringify(snapshot),
          }),
        });

        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(
            result?.error ?? `Lumi decision failed: ${response.status}`,
          );
        }

        const action = (await response.json()) as LumiActionExecution;

        if (disposed) {
          return;
        }

        console.log("[Autonomy] AI action received:", action);

        scene.startLumiAction(action);
      } catch (error) {
        cycleBusy = false;
        autonomyStopped = true;

        console.error("[Autonomy] Lumi autonomy stopped:", error);
      }
    }

    async function handleActionCompleted(
      scene: IslandScene,
      actionId: string,
    ): Promise<void> {
      if (disposed || autonomyStopped) {
        return;
      }

      try {
        const response = await fetch("/api/lumi/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ actionId }),
        });

        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(
            result?.error ?? `Action completion failed: ${response.status}`,
          );
        }

        if (disposed) {
          return;
        }

        console.log("[Autonomy] Action completed:", actionId);

        cycleBusy = false;
        autonomyStopped = false;

        const snapshot = scene.getLumiSnapshot();

        if (snapshot) {
          await requestNextAction(scene, snapshot);
        }
      } catch (error) {
        cycleBusy = false;
        autonomyStopped = true;

        console.error("[Autonomy] Action completion failed:", error);
      }
    }

    async function checkBackendRecovery(): Promise<void> {
      if (disposed || !autonomyStopped || cycleBusy || !islandScene) {
        return;
      }

      try {
        const response = await fetch("/api/lumi/state");

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as {
          state: string;
        };

        if (disposed || result.state !== "idle") {
          return;
        }

        const snapshot = islandScene.getLumiSnapshot();

        if (!snapshot) {
          return;
        }

        console.log("[Autonomy] Backend recovered. Resuming Lumi.");

        autonomyStopped = false;

        await requestNextAction(islandScene, snapshot);
      } catch (error) {
        console.warn("[Autonomy] Recovery status check failed:", error);
      }
    }

    function startRecoveryMonitor(): void {
      if (recoveryMonitor !== null) {
        return;
      }

      recoveryMonitor = setInterval(() => {
        void checkBackendRecovery();
      }, 5_000);
    }

    game.events.once(Phaser.Core.Events.READY, () => {
      console.log("[Autonomy] Phaser READY");

      islandScene = game.scene.getScene("IslandScene") as IslandScene | null;

      if (!islandScene) {
        autonomyStopped = true;
        console.error("[Autonomy] IslandScene could not be found.");
        return;
      }

      islandScene.events.on("lumi-snapshot", (snapshot: LumiSnapshot) => {
        onLumiSnapshot?.(snapshot);
      });

      islandScene.events.on("lumi-action-completed", (actionId: string) => {
        void handleActionCompleted(islandScene!, actionId);
      });

      islandScene.events.once("lumi-ready", () => {
        if (disposed) {
          return;
        }

        console.log("[Autonomy] Lumi initialization completed");

        const snapshot = islandScene!.getLumiSnapshot();

        console.log("[Autonomy] Initial snapshot:", snapshot);

        if (!snapshot) {
          autonomyStopped = true;
          console.error("[Autonomy] Initial snapshot is unavailable.");
          return;
        }

        onLumiSnapshot?.(snapshot);

        startRecoveryMonitor();

        void requestNextAction(islandScene!, snapshot);
      });
    });

    return () => {
      disposed = true;
      autonomyStopped = true;

      if (recoveryMonitor !== null) {
        clearInterval(recoveryMonitor);
        recoveryMonitor = null;
      }

      game.destroy(true);
    };
  }, [onLumiSnapshot]);

  return <div id="game-container" />;
}

export default GameCanvas;
