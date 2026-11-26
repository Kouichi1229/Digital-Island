export type LumiActionType =
  | "move_up"
  | "move_down"
  | "move_left"
  | "move_right"
  | "stop";

export type LumiAction = {
  action: LumiActionType;
  durationSeconds: number;
};

const VALID_ACTIONS: LumiActionType[] = [
  "move_up",
  "move_down",
  "move_left",
  "move_right",
  "stop",
];

export function parseLumiAction(content: string): LumiAction {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Lumi AI returned invalid JSON");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Lumi AI action must be an object");
  }

  const candidate = parsed as Record<string, unknown>;

  if (
    typeof candidate.action !== "string" ||
    !VALID_ACTIONS.includes(candidate.action as LumiActionType)
  ) {
    throw new Error("Lumi AI returned an invalid action");
  }

  if (
    typeof candidate.durationSeconds !== "number" ||
    !Number.isInteger(candidate.durationSeconds) ||
    candidate.durationSeconds < 180 ||
    candidate.durationSeconds > 300
  ) {
    throw new Error(
      "Lumi AI action duration must be an integer between 180 and 300 seconds",
    );
  }

  return {
    action: candidate.action as LumiActionType,
    durationSeconds: candidate.durationSeconds,
  };
}
