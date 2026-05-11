import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
} from "discord.js";

import { parseAttendanceMessage } from "./parser.js";
import { PortalClient, type PortalPayload } from "./portalClient.js";
import { appendEvent, appendUnresolved, logger } from "./logger.js";

interface Env {
  DISCORD_BOT_TOKEN: string;
  DISCORD_GUILD_ID: string;
  ATTENDANCE_CHANNEL_ID: string;
  ATTENDANCE_BOT_ID: string;
  PORTAL_API_URL: string;
  PORTAL_ATTENDANCE_SECRET: string;
  LOG_UNRESOLVED: boolean;
  DRY_RUN: boolean;
}

function loadEnv(): Env {
  const dryRun = (process.env.DRY_RUN ?? "false").toLowerCase() === "true";

  const required = [
    "DISCORD_BOT_TOKEN",
    "DISCORD_GUILD_ID",
    "ATTENDANCE_CHANNEL_ID",
    "ATTENDANCE_BOT_ID",
  ];
  if (!dryRun) {
    required.push("PORTAL_API_URL", "PORTAL_ATTENDANCE_SECRET");
  }

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    logger.error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
    process.exit(1);
  }

  return {
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN!,
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID!,
    ATTENDANCE_CHANNEL_ID: process.env.ATTENDANCE_CHANNEL_ID!,
    ATTENDANCE_BOT_ID: process.env.ATTENDANCE_BOT_ID!,
    PORTAL_API_URL: process.env.PORTAL_API_URL ?? "",
    PORTAL_ATTENDANCE_SECRET: process.env.PORTAL_ATTENDANCE_SECRET ?? "",
    LOG_UNRESOLVED:
      (process.env.LOG_UNRESOLVED ?? "true").toLowerCase() !== "false",
    DRY_RUN: dryRun,
  };
}

async function handleMessage(
  env: Env,
  portal: PortalClient,
  message: Message,
): Promise<void> {
  if (message.channelId !== env.ATTENDANCE_CHANNEL_ID) return;

  if (message.author?.id !== env.ATTENDANCE_BOT_ID) return;

  const parsed = parseAttendanceMessage(message);
  if (!parsed) {
    logger.debug("Ignored non-attendance message", message.id);
    return;
  }

  const base = {
    discordMessageId: message.id,
    discordChannelId: message.channelId,
    discordGuildId: message.guildId,
    discordMessageCreatedAt: message.createdAt.toISOString(),
    rawText: parsed.rawText,
  };

  if (!parsed.discordId) {
    logger.warn(
      `Unresolved attendance message (no Discord ID found) — msg ${message.id}`,
    );
    if (env.LOG_UNRESOLVED) {
      appendUnresolved({
        reason: "NO_DISCORD_ID",
        event: parsed.event,
        displayName: parsed.displayName,
        rank: parsed.rank,
        ...base,
      });
    }
    return;
  }

  const payload: PortalPayload = {
    source: "DISCORD_ATTENDANCE_BOT",
    event: parsed.event,
    discordId: parsed.discordId,
    displayName: parsed.displayName,
    rank: parsed.rank,
    loginTimeText: parsed.loginTimeText,
    logoutTimeText: parsed.logoutTimeText,
    durationText: parsed.durationText,
    dateText: parsed.dateText,
    ...base,
  };

  appendEvent({ dryRun: env.DRY_RUN, ...payload });

  if (env.DRY_RUN) {
    logger.info(
      `[DRY_RUN] Would forward ${payload.event} for ${payload.discordId}:\n` +
        JSON.stringify(payload, null, 2),
    );
    return;
  }

  await portal.send(payload);
}

async function main(): Promise<void> {
  const env = loadEnv();

  const portal = new PortalClient({
    apiUrl: env.PORTAL_API_URL,
    secret: env.PORTAL_ATTENDANCE_SECRET,
  });

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once(Events.ClientReady, (c) => {
    logger.info(`Listener online as ${c.user.tag} (id ${c.user.id})`);
    logger.info(
      `Watching guild=${env.DISCORD_GUILD_ID} channel=${env.ATTENDANCE_CHANNEL_ID} bot=${env.ATTENDANCE_BOT_ID}`,
    );
    if (env.DRY_RUN) {
      logger.info("DRY_RUN=true — parsed payloads will be logged, not POSTed.");
    } else {
      logger.info(`Forwarding to ${env.PORTAL_API_URL}`);
    }
  });

  client.on(Events.MessageCreate, (message) => {
    handleMessage(env, portal, message).catch((err) => {
      logger.error("Unhandled error in message handler:", err);
    });
  });

  client.on(Events.Error, (err) => {
    logger.error("Discord client error:", err);
  });

  process.on("SIGINT", () => {
    logger.info("Received SIGINT, shutting down...");
    void client.destroy();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down...");
    void client.destroy();
    process.exit(0);
  });

  await client.login(env.DISCORD_BOT_TOKEN);
}

main().catch((err) => {
  logger.error("Fatal startup error:", err);
  process.exit(1);
});
