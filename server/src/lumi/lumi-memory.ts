export type LumiObservationMemory = {
  id: number;
  timestamp: string;
  description: string;
};

export type LumiExperienceMemory = {
  id: number;
  timestamp: string;
  event: string;
};

export type LumiThoughtMemory = {
  id: number;
  timestamp: string;
  content: string;
  category: "interest" | "question" | "plan" | "reflection";
};

export type LumiJournalEntry = {
  id: number;
  timestamp: string;
  content: string;
};

export type LumiMemory = {
  sessionStartedAt: string;
  observations: LumiObservationMemory[];
  experiences: LumiExperienceMemory[];
  thoughts: LumiThoughtMemory[];
  journal: LumiJournalEntry[];
};

const memory: LumiMemory = {
  sessionStartedAt: new Date().toISOString(),
  observations: [],
  experiences: [],
  thoughts: [],
  journal: [],
};

let memorySequence = 0;

function nextMemoryId(): number {
  memorySequence += 1;
  return memorySequence;
}

export function getLumiMemory(): LumiMemory {
  return {
    sessionStartedAt: memory.sessionStartedAt,
    observations: [...memory.observations],
    experiences: [...memory.experiences],
    thoughts: [...memory.thoughts],
    journal: [...memory.journal],
  };
}

export function recordObservation(description: string): void {
  memory.observations.push({
    id: nextMemoryId(),
    timestamp: new Date().toISOString(),
    description,
  });
}

export function recordExperience(event: string): void {
  memory.experiences.push({
    id: nextMemoryId(),
    timestamp: new Date().toISOString(),
    event,
  });
}

export function recordThought(
  content: string,
  category: LumiThoughtMemory["category"],
): void {
  memory.thoughts.push({
    id: nextMemoryId(),
    timestamp: new Date().toISOString(),
    content,
    category,
  });
}

export function recordJournalEntry(content: string): void {
  memory.journal.push({
    id: nextMemoryId(),
    timestamp: new Date().toISOString(),
    content,
  });
}
