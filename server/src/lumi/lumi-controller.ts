import { randomUUID } from "node:crypto";
import { checkLumiAIReady, decideLumiAction } from "./lumi-ai";
import type { LumiAction } from "./lumi-action";

export type LumiControllerState = "idle" | "deciding" | "acting" | "error";

export type LumiActionExecution = LumiAction & {
  actionId: string;
};

let currentState: LumiControllerState = "idle";
let activeActionId: string | null = null;
let isRecovering = false;

const RECOVERY_DELAYS_MS = [30_000, 60_000, 120_000, 240_000, 300_000];

let recoveryAttemptIndex = 0;
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

const ALLOWED_TRANSITIONS: Record<LumiControllerState, LumiControllerState[]> =
  {
    idle: ["deciding"],
    deciding: ["acting", "error"],
    acting: ["idle", "error"],
    error: ["idle"],
  };

export function getLumiControllerState(): LumiControllerState {
  return currentState;
}

function setLumiControllerState(nextState: LumiControllerState): void {
  const allowedStates = ALLOWED_TRANSITIONS[currentState];

  if (!allowedStates.includes(nextState)) {
    throw new Error(
      `Invalid Lumi controller state transition: ${currentState} -> ${nextState}`,
    );
  }

  currentState = nextState;
}

function scheduleAutomaticRecovery(): void {
  if (currentState !== "error" || isRecovering || recoveryTimer !== null) {
    return;
  }

  const delay =
    RECOVERY_DELAYS_MS[
      Math.min(recoveryAttemptIndex, RECOVERY_DELAYS_MS.length - 1)
    ];

  recoveryAttemptIndex = Math.min(
    recoveryAttemptIndex + 1,
    RECOVERY_DELAYS_MS.length - 1,
  );

  console.log(
    `[Lumi Recovery] Next recovery check in ${delay / 1000} seconds.`,
  );

  recoveryTimer = setTimeout(() => {
    recoveryTimer = null;

    void attemptRecovery().catch((error) => {
      console.warn("[Lumi Recovery] Recovery check failed:", error);
      scheduleAutomaticRecovery();
    });
  }, delay);
}

async function attemptRecovery(): Promise<void> {
  if (currentState !== "error") {
    throw new Error(
      `Cannot recover Lumi controller while controller is ${currentState}`,
    );
  }

  if (isRecovering) {
    throw new Error("Lumi controller recovery is already in progress");
  }

  isRecovering = true;

  try {
    await checkLumiAIReady();

    if (currentState !== "error") {
      throw new Error(
        `Lumi controller state changed during recovery: ${currentState}`,
      );
    }

    setLumiControllerState("idle");
    recoveryAttemptIndex = 0;

    console.log(
      "[Lumi Recovery] AI provider check succeeded. Controller is idle.",
    );
  } finally {
    isRecovering = false;
  }
}

export function requestLumiAction(
  observation: string,
): Promise<LumiActionExecution> {
  if (currentState !== "idle") {
    throw new Error(
      `Cannot request Lumi action while controller is ${currentState}`,
    );
  }

  setLumiControllerState("deciding");

  return decideAndCreateAction(observation);
}

async function decideAndCreateAction(
  observation: string,
): Promise<LumiActionExecution> {
  try {
    const action = await decideLumiAction(observation);

    const actionId = randomUUID();

    activeActionId = actionId;
    setLumiControllerState("acting");

    return {
      ...action,
      actionId,
    };
  } catch (error) {
    activeActionId = null;
    setLumiControllerState("error");

    scheduleAutomaticRecovery();

    throw error;
  }
}

export function completeLumiAction(actionId: string): void {
  if (currentState !== "acting") {
    throw new Error(
      `Cannot complete Lumi action while controller is ${currentState}`,
    );
  }

  if (actionId !== activeActionId) {
    throw new Error(
      `Lumi action ID mismatch: expected ${activeActionId}, received ${actionId}`,
    );
  }

  setLumiControllerState("idle");
  activeActionId = null;
}

export async function recoverLumiController(): Promise<void> {
  if (currentState !== "error") {
    throw new Error(
      `Cannot recover Lumi controller while controller is ${currentState}`,
    );
  }

  if (isRecovering) {
    throw new Error("Lumi controller recovery is already in progress");
  }

  if (recoveryTimer !== null) {
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }

  try {
    await attemptRecovery();
  } catch (error) {
    scheduleAutomaticRecovery();
    throw error;
  }
}
