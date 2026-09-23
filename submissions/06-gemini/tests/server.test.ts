import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { server } from "../src/server.js";

describe("Web UI & Server Integration Tests", () => {
  const baseUrl = `http://localhost:${server.port}`;

  it("should serve Web UI HTML with dark lacquer theme styles", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("DISCORD BACKFILL · LANCEDB EXPLORER");
    expect(html).toContain("oklch(7% 0.006 95)");
  });

  it("should return database statistics via API", async () => {
    const res = await fetch(`${baseUrl}/api/stats`);
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats.total_messages).toBeGreaterThan(0);
    expect(stats.distinct_channels).toBeGreaterThan(0);
  });

  it("should return messages list", async () => {
    const res = await fetch(`${baseUrl}/api/messages?limit=5`);
    expect(res.status).toBe(200);
    const msgs = await res.json();
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("should execute search query successfully", async () => {
    const res = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "LanceDB", mode: "hybrid", limit: 5 }),
    });
    expect(res.status).toBe(200);
    const results = await res.json();
    expect(Array.isArray(results)).toBe(true);
  });
});
