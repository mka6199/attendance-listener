import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const LOG_DIR = resolve(process.cwd(), "logs");
const UNRESOLVED_FILE = resolve(LOG_DIR, "unresolved.jsonl");
const EVENTS_FILE = resolve(LOG_DIR, "events.jsonl");

function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  info(...args: unknown[]): void {
    console.log(`[${ts()}] [info]`, ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(`[${ts()}] [warn]`, ...args);
  },
  error(...args: unknown[]): void {
    console.error(`[${ts()}] [error]`, ...args);
  },
  debug(...args: unknown[]): void {
    if (process.env.DEBUG) {
      console.log(`[${ts()}] [debug]`, ...args);
    }
  },
};

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function appendUnresolved(entry: Record<string, unknown>): void {
  try {
    ensureDir(UNRESOLVED_FILE);
    appendFileSync(
      UNRESOLVED_FILE,
      JSON.stringify({ at: ts(), ...entry }) + "\n",
      "utf8",
    );
  } catch (err) {
    logger.error("Failed to append unresolved entry:", err);
  }
}

export function appendEvent(entry: Record<string, unknown>): void {
  try {
    ensureDir(EVENTS_FILE);
    appendFileSync(
      EVENTS_FILE,
      JSON.stringify({ at: ts(), ...entry }) + "\n",
      "utf8",
    );
  } catch (err) {
    logger.error("Failed to append event entry:", err);
  }
}
