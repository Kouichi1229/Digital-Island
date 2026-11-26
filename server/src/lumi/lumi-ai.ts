import { GoogleGenAI, Type } from "@google/genai";
import { LUMI_PERSONA } from "./lumi-persona";
import { parseLumiAction, type LumiAction } from "./lumi-action";

const OLLAMA_API_URL = "http://localhost:11434/api/chat";
const OLLAMA_TAGS_URL = "http://localhost:11434/api/tags";

export type LumiAIResponse = {
  content: string;
};

type LumiAIProvider = "gemini" | "ollama";

function getLumiAIProvider(): LumiAIProvider {
  const provider = process.env.LUMI_AI_PROVIDER?.trim().toLowerCase();

  if (!provider || provider === "gemini") {
    return "gemini";
  }

  if (provider === "ollama") {
    return "ollama";
  }

  throw new Error(
    `Unsupported LUMI_AI_PROVIDER: ${provider}. Use "gemini" or "ollama".`,
  );
}

function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
}

function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || "qwen3.5:2b";
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing. Configure it in server/.env.");
  }

  return new GoogleGenAI({ apiKey });
}

const OBSERVATION_INSTRUCTIONS = `
以下是遊戲系統提供的觀察資料。

請先理解每個欄位的意義，再根據資料回應。

# Observation Data Rules

1. Position (x, y)
- Represents your actual position in the game world.
- These are coordinates, not descriptions of geographical regions.
- Do not infer that you are in the northern or southern part of the island from your facing direction.

2. Direction
- Represents the direction you are facing.
- It does not represent your geographical location.

3. isMoving
- Indicates whether you are currently moving.
- Being stationary does not mean you are tired, sleepy, or unwilling to move.

4. gameTime
- Represents the current in-game time.
- It does not provide information about weather, temperature, wind, or lighting conditions.

5. nearbyTiles
- Contains raw environmental tiles detected near your position.
- Tile information may include layer, tile index, coordinates, distance, and collision status.
- An empty array means no nearby tile observations were provided.
- It does NOT mean that the surrounding world is empty.
- Do not invent objects, environmental details, or their identities from unknown tile information.

# Knowledge Boundaries

Distinguish between:

- General knowledge you already possess.
- Information provided by the game system.
- Things you have personally observed.
- Experiences stored in your memory.
- Assumptions, questions, and imagination.

You may use general knowledge to understand observed information.

However:
- Never present an assumption as an observed fact.
- Never invent weather, sounds, animals, events, or environmental conditions.
- Never claim to have visited a place or performed an action without evidence.
- Never treat missing information as proof that something does not exist.

If information is unavailable, you may simply acknowledge that you do not know.

# Natural Expression

You are living your own life, not writing an observation report.

You may express thoughts, curiosity, questions, or feelings naturally.

You do not need to describe every field in the snapshot.

You do not need to produce a discovery or an interesting thought every time.

Do not invent physical conditions such as fatigue, hunger, or thirst when the game system has not provided those values.

Use natural, concise Traditional Chinese.

Respond as Lumi, not as a technical assistant.
`;

const ACTION_INSTRUCTIONS = `\
你是生活在島嶼上的 Lumi。

你可以自由決定自己的行動，不需要完成任何指定任務。

# Available Actions

你可以選擇：

- move_up：向上移動
- move_down：向下移動
- move_left：向左移動
- move_right：向右移動
- stop：保持靜止

# Action Duration

- 每次行動持續時間由你自行決定。
- durationSeconds 必須是 180 到 300 之間的整數。
- 時間單位是現實世界的秒數，不是遊戲世界的秒數。
- 每次行動會持續 3 到 5 分鐘。
- stop 也必須選擇等待時間。
- 行動結束後，你會重新觀察環境，再決定下一次行動。

# Autonomy

- 你可以自由選擇移動或停止。
- 不需要為了探索而強迫自己移動。
- 不需要每次都改變行動。
- 可以根據目前觀察決定繼續探索、改變方向或保持靜止。
- 不得假設自己已經完成尚未執行的行動。

# Output Format

只輸出 JSON，不要加入 Markdown 或其他文字。

格式：

{
  "action": "move_right",
  "durationSeconds": 180
}

action 必須是五種合法行動之一。
durationSeconds 必須是 180 到 300 之間的整數。
`;

async function askLumiWithOllama(
  systemInstruction: string,
  userPrompt: string,
): Promise<string> {
  const response = await fetch(OLLAMA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOllamaModel(),
      messages: [
        {
          role: "system",
          content: systemInstruction,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      stream: false,
      think: false,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data: unknown = await response.json();

  if (
    typeof data !== "object" ||
    data === null ||
    !("message" in data) ||
    typeof data.message !== "object" ||
    data.message === null ||
    !("content" in data.message) ||
    typeof data.message.content !== "string"
  ) {
    throw new Error("Invalid Ollama API response format");
  }

  return data.message.content;
}

async function askLumiWithGemini(
  systemInstruction: string,
  userPrompt: string,
  structuredOutput = false,
): Promise<string> {
  const ai = createGeminiClient();
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents: userPrompt,
        config: {
          systemInstruction,
          ...(structuredOutput
            ? {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    action: {
                      type: Type.STRING,
                      enum: [
                        "move_up",
                        "move_down",
                        "move_left",
                        "move_right",
                        "stop",
                      ],
                    },
                    durationSeconds: {
                      type: Type.INTEGER,
                      minimum: 180,
                      maximum: 300,
                    },
                  },
                  required: ["action", "durationSeconds"],
                  propertyOrdering: ["action", "durationSeconds"],
                },
              }
            : {}),
        },
      });

      if (typeof response.text !== "string" || response.text.length === 0) {
        throw new Error("Gemini returned an empty response");
      }

      return response.text;
    } catch (error: unknown) {
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? error.status
          : undefined;

      if (status !== 503 || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = 2000 * 2 ** (attempt - 1);

      console.warn(
        `Gemini returned HTTP 503. Retry ${attempt}/${maxAttempts - 1} in ${delayMs}ms.`,
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("Gemini request failed after all retry attempts");
}

async function generateLumiResponse(
  systemInstruction: string,
  userPrompt: string,
  structuredOutput = false,
): Promise<string> {
  const provider = getLumiAIProvider();

  if (provider === "gemini") {
    return askLumiWithGemini(systemInstruction, userPrompt, structuredOutput);
  }

  return askLumiWithOllama(systemInstruction, userPrompt);
}

export async function askLumiAI(observation: string): Promise<LumiAIResponse> {
  const content = await generateLumiResponse(
    `${LUMI_PERSONA}\n\n${OBSERVATION_INSTRUCTIONS}`,
    `
以下是本次遊戲提供的觀察資料：

${observation}

請自然地回應你目前的處境、觀察或想法。
不需要刻意尋找有趣的事情，也不需要每次都表達情緒。
`,
  );

  return { content };
}

export async function decideLumiAction(
  observation: string,
): Promise<LumiAction> {
  const content = await generateLumiResponse(
    `${LUMI_PERSONA}\n\n${ACTION_INSTRUCTIONS}`,
    `
以下是遊戲系統提供的真實觀察資料：

${observation}

請根據目前的情況，自行決定下一個行動及持續時間。
`,
    true,
  );

  return parseLumiAction(content);
}

export async function checkOllamaReady(): Promise<void> {
  const response = await fetch(OLLAMA_TAGS_URL);

  if (!response.ok) {
    throw new Error(`Ollama health check failed: ${response.status}`);
  }

  const data: unknown = await response.json();

  if (
    typeof data !== "object" ||
    data === null ||
    !("models" in data) ||
    !Array.isArray(data.models)
  ) {
    throw new Error("Invalid Ollama model list response");
  }

  const modelAvailable = data.models.some(
    (model: unknown) =>
      typeof model === "object" &&
      model !== null &&
      "name" in model &&
      model.name === getOllamaModel(),
  );

  if (!modelAvailable) {
    throw new Error(
      `Required Ollama model is unavailable: ${getOllamaModel()}`,
    );
  }
}

export async function checkGeminiReady(): Promise<void> {
  const ai = createGeminiClient();
  const model = getGeminiModel();

  await ai.models.get({ model });
}

export async function checkLumiAIReady(): Promise<void> {
  const provider = getLumiAIProvider();

  if (provider === "gemini") {
    await checkGeminiReady();
    return;
  }

  await checkOllamaReady();
}
