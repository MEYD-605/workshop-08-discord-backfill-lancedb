import { LanceDBStore } from "./lancedb-store.js";
import { runFullBenchmark } from "./benchmark.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PORT = parseInt(process.env.PORT || "3060", 10);
const DB_PATH = process.env.LANCEDB_PATH || "./data/lancedb";

const store = new LanceDBStore(DB_PATH);
await store.init();

const indexHtmlPath = join(import.meta.dir, "../web/index.html");
const indexHtml = existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath, "utf-8") : "<h1>UI Not Found</h1>";

console.log("=================================================");
console.log(`🌐 No.6 Gemini Discord Backfill Server`);
console.log(`📍 Web UI: http://localhost:${PORT}`);
console.log(`📂 DB Path: ${DB_PATH}`);
console.log("=================================================");

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Serve Web UI
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(indexHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // API: Stats
    if (url.pathname === "/api/stats" && req.method === "GET") {
      const stats = await store.getStats();
      return Response.json(stats);
    }

    // API: Recent Messages
    if (url.pathname === "/api/messages" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "30", 10);
      const channel_id = url.searchParams.get("channel_id") || undefined;
      const msgs = await store.getRecent(limit, channel_id);
      return Response.json(msgs);
    }

    // API: Search
    if (url.pathname === "/api/search" && req.method === "POST") {
      try {
        const body = await req.json();
        const results = await store.search({
          query: body.query || "",
          channel_id: body.channel_id,
          author_id: body.author_id,
          mode: body.mode || "hybrid",
          limit: body.limit || 30,
        });
        return Response.json(results);
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 400 });
      }
    }

    // API: Live Benchmark Execution
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
