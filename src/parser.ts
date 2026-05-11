import type { Message } from "discord.js";

export type AttendanceEventType = "DUTY_START" | "DUTY_END";

export interface ParsedAttendanceEvent {
  event: AttendanceEventType;
  discordId: string | null;
  displayName: string | null;
  rank: string | null;
  loginTimeText: string | null;
  logoutTimeText: string | null;
  durationText: string | null;
  dateText: string | null;
  rawText: string;
}

const DUTY_START_KEYS = ["تم تسجيل دخولك بنجاح", "تم تسجيل دخولك"];
const DUTY_END_KEYS = ["تم تسجيل خروجك بنجاح", "تم تسجيل خروجك"];

const DISCORD_MENTION_RE = /<@!?(\d{15,25})>/;
const DISCORD_RAW_ID_RE = /\b(\d{17,21})\b/;

function collectRawText(message: Message): string {
  const parts: string[] = [];

  if (message.content) parts.push(message.content);

  const embed = message.embeds?.[0];
  if (embed) {
    if (embed.title) parts.push(embed.title);
    if (embed.description) parts.push(embed.description);
    if (embed.author?.name) parts.push(embed.author.name);
    if (embed.footer?.text) parts.push(embed.footer.text);
    if (Array.isArray(embed.fields)) {
      for (const f of embed.fields) {
        if (f.name) parts.push(f.name);
        if (f.value) parts.push(f.value);
      }
    }
  }

  return parts.join("\n").trim();
}

function detectEvent(raw: string): AttendanceEventType | null {
  for (const k of DUTY_END_KEYS) {
    if (raw.includes(k)) return "DUTY_END";
  }
  for (const k of DUTY_START_KEYS) {
    if (raw.includes(k)) return "DUTY_START";
  }
  return null;
}

function extractDiscordId(message: Message, raw: string): string | null {
  const firstMentioned = message.mentions?.users?.first?.();
  if (firstMentioned?.id) return firstMentioned.id;

  const mentionMatch = raw.match(DISCORD_MENTION_RE);
  if (mentionMatch) return mentionMatch[1];

  const rawMatch = raw.match(DISCORD_RAW_ID_RE);
  if (rawMatch) return rawMatch[1];

  return null;
}

function extractField(raw: string, label: string): string | null {
  const re = new RegExp(
    `${escapeRegex(label)}\\s*[:：]?\\s*([^\\n\\r]+)`,
    "u",
  );
  const m = raw.match(re);
  if (!m) return null;
  return cleanValue(m[1]);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanValue(s: string): string {
  return s
    .replace(/<@!?(\d+)>/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim();
}

function extractDisplayName(message: Message, raw: string): string | null {
  const fromField = extractField(raw, "اسم الموظف");
  if (fromField && !/^\d{15,25}$/.test(fromField)) {
    return fromField;
  }

  const firstMentioned = message.mentions?.users?.first?.();
  if (firstMentioned) {
    const member = message.mentions.members?.first?.();
    const candidate = member?.displayName ?? firstMentioned.username ?? null;
    if (candidate) return candidate;
  }

  return fromField;
}

export function parseAttendanceMessage(
  message: Message,
): ParsedAttendanceEvent | null {
  const raw = collectRawText(message);
  if (!raw) return null;

  const event = detectEvent(raw);
  if (!event) return null;

  const discordId = extractDiscordId(message, raw);
  const displayName = extractDisplayName(message, raw);
  const rank = extractField(raw, "الرتبة الحالية");
  const loginTimeText = extractField(raw, "سجل دخولك");
  const logoutTimeText = extractField(raw, "سجل خروجك");
  const durationText = extractField(raw, "مجموع وقتك المباشر");

  const dateMatch = raw.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  const dateText = dateMatch ? dateMatch[1] : null;

  return {
    event,
    discordId,
    displayName,
    rank,
    loginTimeText,
    logoutTimeText,
    durationText,
    dateText,
    rawText: raw,
  };
}
