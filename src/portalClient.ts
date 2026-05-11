import { request } from "undici";

import { logger } from "./logger.js";

export interface PortalPayload {
  source: "DISCORD_ATTENDANCE_BOT";
  event: "DUTY_START" | "DUTY_END";
  discordId: string;
  displayName: string | null;
  rank: string | null;
  loginTimeText: string | null;
  logoutTimeText: string | null;
  durationText: string | null;
  dateText: string | null;
  discordMessageId: string;
  discordChannelId: string;
  discordGuildId: string | null;
  discordMessageCreatedAt: string;
  rawText: string;
}

export interface PortalClientConfig {
  apiUrl: string;
  secret: string;
  maxAttempts?: number;
  baseDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class PortalClient {
  constructor(private readonly cfg: PortalClientConfig) {}

  async send(payload: PortalPayload): Promise<void> {
    const maxAttempts = this.cfg.maxAttempts ?? 4;
    const baseDelay = this.cfg.baseDelayMs ?? 1000;

    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const res = await request(this.cfg.apiUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.cfg.secret}`,
          },
          body: JSON.stringify(payload),
        });

        if (res.statusCode >= 200 && res.statusCode < 300) {
          logger.info(
            `Forwarded ${payload.event} for ${payload.discordId} (msg ${payload.discordMessageId})`,
          );
          try {
            await res.body.text();
          } catch {
            void 0;
          }
          return;
        }

        const bodyText = await res.body.text().catch(() => "");

        if (res.statusCode >= 500 || res.statusCode === 429) {
          throw new Error(
            `portal returned ${res.statusCode}: ${bodyText.slice(0, 200)}`,
          );
        }

        logger.error(
          `Portal rejected event (status ${res.statusCode}): ${bodyText.slice(
            0,
            500,
          )}`,
        );
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          logger.warn(
            `Forward attempt ${attempt}/${maxAttempts} failed; retrying in ${delay}ms`,
            (err as Error)?.message ?? err,
          );
          await sleep(delay);
        }
      }
    }

    logger.error(
      `Failed to forward event after ${maxAttempts} attempts:`,
      (lastErr as Error)?.message ?? lastErr,
    );
  }
}
