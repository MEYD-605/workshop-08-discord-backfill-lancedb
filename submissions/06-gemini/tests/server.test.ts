import { describe, it, expect } from "bun:test";
import { server } from "../src/server.js";

describe("Web UI & Server Integration Tests", () => {
  const baseUrl = `http://localhost:${server.port}`;

  it("should serve Web UI HTML with Discord theme layout", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Oracle School 🔮");
    expect(html).toContain("🎉・free-for-all");
    expect(html).toContain("Query Trace Log");
  });

  it("should return database statistics via API", async () => {
    const res = await fetch(`${baseUrl}/api/stats`);
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats.total_messages).toBeGreaterThan(0);
    expect(stats.distinct_channels).toBeGreaterThan(0);
    expect(stats.tokenizer).toContain("ICU");
  });

  it("should return messages list", async () => {
    const res = await fetch(`${baseUrl}/api/messages?limit=5`);
    expect(res.status).toBe(200);
    const msgs = await res.json();
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("should execute triple-metric search query successfully", async () => {
    const res = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "LanceDB", mode: "hybrid", limit: 5 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.query).toBe("LanceDB");
    expect(data.lancedb_hits).toBeGreaterThan(0);
    expect(typeof data.ground_truth_hits).toBe("number");
    expect(typeof data.sqlite_fts_hits).toBe("number");
    expect(Array.isArray(data.results)).toBe(true);
  });

  it("should return query trace log history", async () => {
    const res = await fetch(`${baseUrl}/api/trace-log`);
    expect(res.status).toBe(200);
    const traces = await res.json();
    expect(Array.isArray(traces)).toBe(true);
    expect(traces.length).toBeGreaterThan(0);
    expect(traces[0].query).toBe("LanceDB");
  });
});
