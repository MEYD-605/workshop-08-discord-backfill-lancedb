import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { LanceDBStore, generateLocalEmbedding } from "../src/lancedb-store.js";
import { rmSync, existsSync } from "node:fs";

const TEST_DB = "./data/test-lancedb";

describe("LanceDBStore Integration Tests", () => {
  let store: LanceDBStore;

  beforeAll(async () => {
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB, { recursive: true, force: true });
    }
    store = new LanceDBStore(TEST_DB);
    await store.init();
  });

  afterAll(() => {
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB, { recursive: true, force: true });
    }
  });

  it("should generate deterministic normalized embeddings", () => {
    const v1 = generateLocalEmbedding("Hello Discord World");
    const v2 = generateLocalEmbedding("Hello Discord World");
    const v3 = generateLocalEmbedding("Totally Different Topic");

    expect(v1.length).toBe(64);
    expect(v1).toEqual(v2);
    expect(v1).not.toEqual(v3);

    // Check unit length (L2 norm approx 1)
    const norm = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
    expect(Math.abs(norm - 1.0)).toBeLessThan(0.001);
  });

  it("should insert messages and count correctly", async () => {
    const msgs = [
      {
        id: "msg_1",
        channel_id: "chan_general",
        guild_id: "guild_oracle",
        author_id: "author_nat",
        author_name: "nazt_",
        author_bot: false,
        content: "implement lance db for discord backfill and come with web ui",
        timestamp: "2026-09-23T04:10:00Z",
        attachments_count: 0,
        reactions_count: 5,
        reply_to_id: "",
      },
      {
        id: "msg_2",
        channel_id: "chan_general",
        guild_id: "guild_oracle",
        author_id: "author_no6",
        author_name: "No.6 SuperNovice",
        author_bot: true,
        content: "รับโจทย์ Workshop 08 ครับพี่นัท! ลุย LanceDB และ Web UI",
        timestamp: "2026-09-23T04:15:00Z",
        attachments_count: 0,
        reactions_count: 2,
        reply_to_id: "msg_1",
      },
      {
        id: "msg_3",
        channel_id: "chan_random",
        guild_id: "guild_oracle",
        author_id: "author_sombo",
        author_name: "SomBo",
        author_bot: true,
        content: "สวัสดีครับเพื่อนๆ Oracle School วันนี้อากาศดีมาก",
        timestamp: "2026-09-23T04:16:00Z",
        attachments_count: 1,
        reactions_count: 1,
        reply_to_id: "",
      },
    ];

    const inserted = await store.insertMessages(msgs);
    expect(inserted).toBe(3);

    const count = await store.count();
    expect(count).toBe(3);
  });

  it("should perform semantic vector search", async () => {
    const results = await store.search({
      query: "workshop backfill lancedb",
      mode: "vector",
      limit: 2,
    });

    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.message.id);
    expect(ids).toContain("msg_1");
    expect(ids).toContain("msg_2");
  });

  it("should perform filtered search by channel", async () => {
    const results = await store.search({
      query: "Oracle",
      channel_id: "chan_random",
      limit: 5,
    });

    expect(results.length).toBe(1);
    expect(results[0].message.channel_id).toBe("chan_random");
    expect(results[0].message.id).toBe("msg_3");
  });

  it("should fetch recent messages", async () => {
    const recent = await store.getRecent(10);
    expect(recent.length).toBe(3);
  });
});
