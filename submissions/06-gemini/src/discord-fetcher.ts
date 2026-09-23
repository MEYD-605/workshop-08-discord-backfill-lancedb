import type { DiscordMessage, BackfillCursor } from "./types.js";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

export class DiscordFetcher {
  private token?: string;
  private cursorFile: string;

  constructor(token?: string, cursorFile: string = "./data/cursor.json") {
    this.token = token || process.env.DISCORD_BOT_TOKEN;
    this.cursorFile = cursorFile;
  }

  loadCursor(channel_id: string): BackfillCursor {
    if (existsSync(this.cursorFile)) {
      try {
        const data = JSON.parse(readFileSync(this.cursorFile, "utf-8"));
        if (data[channel_id]) return data[channel_id];
      } catch {}
    }

    return {
      channel_id,
      last_message_id: "",
      oldest_message_id: "",
      total_messages: 0,
      updated_at: new Date().toISOString(),
    };
  }

  saveCursor(cursor: BackfillCursor): void {
    let allCursors: Record<string, BackfillCursor> = {};
    if (existsSync(this.cursorFile)) {
      try {
        allCursors = JSON.parse(readFileSync(this.cursorFile, "utf-8"));
      } catch {}
    }
    allCursors[cursor.channel_id] = cursor;
    writeFileSync(this.cursorFile, JSON.stringify(allCursors, null, 2), "utf-8");
  }

  /**
   * Fetch messages via Discord REST API using watermark cursor.
   * If token is not present or API call fails, falls back gracefully.
   */
  async fetchBatchFromDiscord(channel_id: string, before?: string, limit: number = 100): Promise<DiscordMessage[]> {
    if (!this.token) {
      console.warn("⚠️ No DISCORD_BOT_TOKEN provided, skipping live API fetch.");
      return [];
    }

    let url = `https://discord.com/api/v10/channels/${channel_id}/messages?limit=${limit}`;
    if (before) {
      url += `&before=${before}`;
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bot ${this.token}`,
        "User-Agent": "No6-LanceDB-Backfill (maclab, v1.0.0)",
      },
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 2000;
      console.warn(`⏳ Rate limited (429). Retrying after ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
      return this.fetchBatchFromDiscord(channel_id, before, limit);
    }

    if (!res.ok) {
      throw new Error(`Discord API error: ${res.status} ${res.statusText}`);
    }

    const raw: any[] = await res.json();
    return raw.map((m) => ({
      id: m.id,
      channel_id: m.channel_id,
      guild_id: m.guild_id || "",
      author_id: m.author?.id || "unknown",
      author_name: m.author?.username || "unknown",
      author_bot: !!m.author?.bot,
      content: m.content || "",
      timestamp: m.timestamp || new Date().toISOString(),
      attachments_count: m.attachments ? m.attachments.length : 0,
      reactions_count: m.reactions ? m.reactions.reduce((sum: number, r: any) => sum + (r.count || 0), 0) : 0,
      reply_to_id: m.message_reference?.message_id || "",
    }));
  }
}
