import { LanceDBStore } from "./lancedb-store.js";
import { runFullBenchmark } from "./benchmark.js";
import { Database } from "bun:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PORT = parseInt(process.env.PORT || "3060", 10);
const DB_PATH = process.env.LANCEDB_PATH || "./data/lancedb";

const store = new LanceDBStore(DB_PATH);
await store.init();

// Mirror SQLite in-memory or file for ground-truth & FTS5 comparison
const sqliteDbPath = "./data/legacy_sqlite_mirror.db";
const sqliteDb = new Database(sqliteDbPath);
sqliteDb.run("PRAGMA journal_mode = WAL;");
sqliteDb.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT,
    guild_id TEXT,
    author_id TEXT,
    author_name TEXT,
    author_bot INTEGER,
    content TEXT,
    timestamp TEXT,
    attachments_count INTEGER,
    reactions_count INTEGER,
    reply_to_id TEXT
  );
`);
sqliteDb.run(`
  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    content='messages',
    content_rowid='rowid',
    tokenize='unicode61'
  );
`);

// Synchronize messages to SQLite mirror if empty
const countSqlite = (sqliteDb.query("SELECT COUNT(*) as count FROM messages").get() as any)?.count || 0;
if (countSqlite === 0) {
  const allLanceMsgs = await store.getRecent(5000);
  sqliteDb.run("BEGIN TRANSACTION;");
  const ins = sqliteDb.prepare(`
    INSERT OR REPLACE INTO messages VALUES ($id, $channel_id, $guild_id, $author_id, $author_name, $author_bot, $content, $timestamp, $attachments, $reactions, $reply);
  `);
  const insFts = sqliteDb.prepare(`
    INSERT INTO messages_fts(rowid, content) VALUES (last_insert_rowid(), $content);
  `);
  for (const m of allLanceMsgs) {
    ins.run({
      $id: m.id,
      $channel_id: m.channel_id,
      $guild_id: m.guild_id,
      $author_id: m.author_id,
      $author_name: m.author_name,
      $author_bot: m.author_bot ? 1 : 0,
      $content: m.content,
      $timestamp: m.timestamp,
      $attachments: m.attachments_count,
      $reactions: m.reactions_count,
      $reply: m.reply_to_id,
    });
    insFts.run({ $content: m.content });
  }
  sqliteDb.run("COMMIT;");
}

// In-memory Query Trace Log
interface TraceLogItem {
  id: string;
  query: string;
  mode: string;
  channel_id?: string;
  duration_ms: number;
  hits_lancedb: number;
  hits_sqlite_fts: number;
  hits_ground_truth: number;
  zero_hit: boolean;
  timestamp: string;
}

const queryTraceLog: TraceLogItem[] = [];

const indexHtmlPath = join(import.meta.dir, "../web/index.html");
const indexHtml = existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath, "utf-8") : "<h1>UI Not Found</h1>";

console.log("=================================================");
console.log(`🌐 No.6 Gemini Discord Backfill Server (Discord UI Edition)`);
console.log(`📍 Web UI: http://localhost:${PORT}`);
console.log(`📂 LanceDB Path: ${DB_PATH}`);
console.log("=================================================");

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Serve Discord Web UI
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const liveHtml = existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath, "utf-8") : indexHtml;
      return new Response(liveHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // API: Stats Page Data
    if (url.pathname === "/api/stats" && req.method === "GET") {
      const stats = await store.getStats();
      const sqliteCount = (sqliteDb.query("SELECT COUNT(*) as count FROM messages").get() as any)?.count || 0;
      return Response.json({
        ...stats,
        sqlite_messages: sqliteCount,
        parity: stats.total_messages === sqliteCount && stats.total_messages > 0,
        tokenizer: "ICU (dictionary-based boundary) + 64-dim HNSW Vector",
      });
    }

    // API: Query Trace Log
    if (url.pathname === "/api/trace-log" && req.method === "GET") {
      return Response.json(queryTraceLog);
    }

    // API: Recent Messages
    if (url.pathname === "/api/messages" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const channel_id = url.searchParams.get("channel_id") || undefined;
      const msgs = await store.getRecent(limit, channel_id);
      return Response.json(msgs);
    }

    // API: Triple-Metric Search (Ground Truth LIKE vs SQLite FTS5 vs LanceDB ICU)
    if (url.pathname === "/api/search" && req.method === "POST") {
      try {
        const body = await req.json();
        const queryStr = (body.query || "").trim();
        const mode = body.mode || "hybrid";
        const channel_id = body.channel_id;
        const limit = body.limit || 40;

        if (!queryStr) {
          const recents = await store.getRecent(limit, channel_id);
          return Response.json({
            query: "",
            ground_truth_hits: recents.length,
            sqlite_fts_hits: recents.length,
            lancedb_hits: recents.length,
            duration_ms: 0,
            results: recents.map((m) => ({ message: m, score: 1.0, match_type: "recent" })),
          });
        }

        // 1. Ground Truth (LIKE '%query%')
        const t0_gt = performance.now();
        let gtRows: any[] = [];
        try {
          gtRows = sqliteDb.query("SELECT id FROM messages WHERE content LIKE $q").all({ $q: `%${queryStr}%` });
        } catch {}
        const groundTruthHits = gtRows.length;

        // 2. SQLite FTS5 (unicode61)
        let sqliteFtsHits = 0;
        try {
          const sqlRes = sqliteDb.query("SELECT rowid FROM messages_fts WHERE messages_fts MATCH $q").all({ $q: `${queryStr}*` });
          sqliteFtsHits = sqlRes.length;
        } catch {
          sqliteFtsHits = 0;
        }

        // 3. LanceDB Search
        const t0_lance = performance.now();
        const results = await store.search({
          query: queryStr,
          channel_id,
          mode,
          limit,
        });
        const durationMs = Number((performance.now() - t0_lance).toFixed(2));
        const lancedbHits = results.length;

        // Record in Trace Log
        queryTraceLog.unshift({
          id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          query: queryStr,
          mode,
          channel_id,
          duration_ms: durationMs,
          hits_lancedb: lancedbHits,
          hits_sqlite_fts: sqliteFtsHits,
          hits_ground_truth: groundTruthHits,
          zero_hit: lancedbHits === 0,
          timestamp: new Date().toISOString(),
        });

        if (queryTraceLog.length > 200) queryTraceLog.pop();

        return Response.json({
          query: queryStr,
          ground_truth_hits: groundTruthHits,
          sqlite_fts_hits: sqliteFtsHits,
          lancedb_hits: lancedbHits,
          duration_ms: durationMs,
          results,
        });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 400 });
      }
    }

    // API: Live Benchmark
    if (url.pathname === "/api/benchmark" && req.method === "POST") {
      try {
        const results = await runFullBenchmark(1000);
        return Response.json(results);
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

export { server };
