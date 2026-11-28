export type LumiConfig = Readonly<{
  experimentalQueueCapacity: number;
  errorQueueCapacity: number;
}>;

const EXPERIMENTAL_QUEUE_CAPACITY = {
  envName: "LUMI_EXPERIMENTAL_QUEUE_CAPACITY",
  defaultValue: 1000,
  min: 1,
  max: 10000,
} as const;

const ERROR_QUEUE_CAPACITY = {
  envName: "LUMI_ERROR_QUEUE_CAPACITY",
  defaultValue: 200,
  min: 1,
  max: 2000,
} as const;

function parseQueueCapacity(
  env: Record<string, string | undefined>,
  setting: {
    envName: string;
    defaultValue: number;
    min: number;
    max: number;
  },
): number {
  const rawValue = env[setting.envName];

  if (rawValue === undefined) {
    return setting.defaultValue;
  }

  // Accept only canonical positive decimal integers (no sign, whitespace,
  // leading zero, decimal point, or exponent notation).
  if (!/^[1-9][0-9]*$/.test(rawValue)) {
    throw new Error(
      `${setting.envName} must be a decimal integer between ${setting.min} and ${setting.max}; received ${JSON.stringify(rawValue)}.`,
    );
  }

  const value = Number(rawValue);

  if (
    !Number.isSafeInteger(value) ||
    value < setting.min ||
    value > setting.max
  ) {
    throw new Error(
      `${setting.envName} must be a decimal integer between ${setting.min} and ${setting.max}; received ${JSON.stringify(rawValue)}.`,
    );
  }

  return value;
}

export function loadLumiConfig(
  env: Record<string, string | undefined> = process.env,
): LumiConfig {
  return {
    experimentalQueueCapacity: parseQueueCapacity(
      env,
      EXPERIMENTAL_QUEUE_CAPACITY,
    ),
    errorQueueCapacity: parseQueueCapacity(env, ERROR_QUEUE_CAPACITY),
  };
}
