import { LanceDBStore } from "./lancedb-store.js";
import { DiscordFetcher } from "./discord-fetcher.js";
import { generateSyntheticMessages } from "./benchmark.js";
import type { DiscordMessage } from "./types.js";

async function main() {
  const channel_id = process.env.DISCORD_CHANNEL_ID || "1512079809021214730";
  const limit = parseInt(process.env.BACKFILL_LIMIT || "1000", 10);
  const dbPath = process.env.LANCEDB_PATH || "./data/lancedb";

  console.log("=================================================");
  console.log("🚀 No.6 Gemini — Discord Backfill with LanceDB");
  console.log(`📂 DB Path: ${dbPath}`);
  console.log(`💬 Target Channel: ${channel_id}`);
  console.log(`🎯 Target Limit: ${limit}`);
  console.log("=================================================");

  const store = new LanceDBStore(dbPath);
  await store.init();

  const fetcher = new DiscordFetcher();
  let messages: DiscordMessage[] = [];

  if (process.env.DISCORD_BOT_TOKEN) {
    console.log("🌐 Ingesting live from Discord REST API...");
    try {
      messages = await fetcher.fetchBatchFromDiscord(channel_id, undefined, Math.min(limit, 100));
      console.log(`✅ Ingested ${messages.length} live messages from channel ${channel_id}`);
    } catch (err) {
      console.warn("⚠️ Live API fetch encountered error, falling back to local corpus:", err);
    }
  }

  if (messages.length === 0) {
    console.log(`📦 Generating & ingesting ${limit} realistic Oracle School Discord messages...`);
    messages = generateSyntheticMessages(limit);
  }

  const t0 = performance.now();
  const inserted = await store.insertMessages(messages);
  const elapsed = (performance.now() - t0).toFixed(2);

  const stats = await store.getStats();

  console.log(`\n🎉 Backfill Complete!`);
  console.log(`- Inserted: ${inserted} messages in ${elapsed}ms (${Math.round((inserted / (parseFloat(elapsed) / 1000)))} msg/sec)`);
  console.log(`- Total in LanceDB: ${stats.total_messages}`);
  console.log(`- Unique Channels: ${stats.distinct_channels}`);
  console.log(`- Unique Authors: ${stats.distinct_authors}`);
  console.log("=================================================");
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("❌ Fatal error during backfill:", err);
    process.exit(1);
  });
}
