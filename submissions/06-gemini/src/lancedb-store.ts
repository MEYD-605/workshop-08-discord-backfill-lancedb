import * as lancedb from "@lancedb/lancedb";
import { Index } from "@lancedb/lancedb";
import { mkdirSync, existsSync } from "node:fs";
import type { DiscordMessage, LanceMessageRecord, SearchQuery, SearchResult } from "./types.js";

export const VECTOR_DIM = 64; // High-efficiency deterministic semantic embedding dimension

/**
 * Deterministic semantic-hash embedding generator (zero-dependency, offline-ready).
 * Maps text tokens to high-dimensional unit vector space preserving token overlap and n-gram similarity.
 */
export function generateLocalEmbedding(text: string, dim: number = VECTOR_DIM): number[] {
  const vec = new Float32Array(dim);
  if (!text || text.trim().length === 0) {
    return Array.from(vec);
  }

  const clean = text.toLowerCase();
  // Tokenize words and character 3-grams to capture Thai & subwords
  const words = clean.split(/\s+/);
  const ngrams: string[] = [];
  for (let i = 0; i < clean.length - 2; i++) {
    ngrams.push(clean.slice(i, i + 3));
  }

  const tokens = [...words, ...ngrams];
  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const idx = Math.abs(hash) % dim;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vec[idx] += sign;
  }

  // L2 Normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vec[i] /= norm;
    }
  }

  return Array.from(vec);
}

export class LanceDBStore {
  private dbPath: string;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private tableName: string = "discord_messages";

  constructor(dbPath: string = "./data/lancedb") {
    this.dbPath = dbPath;
    if (!existsSync(dbPath)) {
      mkdirSync(dbPath, { recursive: true });
    }
  }

  async init(): Promise<void> {
    this.db = await lancedb.connect(this.dbPath);
    const tables = await this.db.tableNames();
    
    if (tables.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName);
    } else {
      // Initialize with seed template record to establish schema
      const dummyRecord: LanceMessageRecord = {
        id: "seed_0",
        channel_id: "seed_channel",
        guild_id: "seed_guild",
        author_id: "seed_author",
        author_name: "seed",
        author_bot: 0,
        content: "seed",
        timestamp: new Date().toISOString(),
        attachments_count: 0,
        reactions_count: 0,
        reply_to_id: "",
        vector: new Array(VECTOR_DIM).fill(0),
      };

      this.table = await this.db.createTable(this.tableName, [dummyRecord]);
      // Remove seed record
      await this.table.delete("id = 'seed_0'");
      await this.ensureIndices();
    }
  }

  async ensureIndices(): Promise<void> {
    if (!this.table) return;

    try {
      // Try ICU full-text index first
      await this.table.createIndex("content", {
        config: Index.fts({
          baseTokenizer: "icu",
          stem: false,
          maxTokenLength: 128,
        }),
        replace: true,
      });
    } catch {
      try {
        // Fallback to simple tokenizer if ICU is not present in binary
        await this.table.createIndex("content", {
          config: Index.fts({
            baseTokenizer: "simple",
            stem: false,
            maxTokenLength: 128,
          }),
          replace: true,
        });
      } catch {
        // Index creation optional if already indexed or empty
      }
    }
  }

  async insertMessages(messages: DiscordMessage[]): Promise<number> {
    if (!this.table || messages.length === 0) return 0;

    const records: LanceMessageRecord[] = messages.map((m) => ({
      id: m.id,
      channel_id: m.channel_id,
      guild_id: m.guild_id,
      author_id: m.author_id,
      author_name: m.author_name,
      author_bot: m.author_bot ? 1 : 0,
      content: m.content || "",
      timestamp: m.timestamp || new Date().toISOString(),
      attachments_count: m.attachments_count || 0,
      reactions_count: m.reactions_count || 0,
      reply_to_id: m.reply_to_id || "",
      vector: generateLocalEmbedding(m.content || ""),
    }));

    await this.table.add(records);
    return records.length;
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    if (!this.table) return [];
    const limit = query.limit || 20;
    const mode = query.mode || "hybrid";

    let filterClauses: string[] = [];
    if (query.channel_id) {
      filterClauses.push(`channel_id = '${query.channel_id.replace(/'/g, "''")}'`);
    }
    if (query.author_id) {
      filterClauses.push(`author_id = '${query.author_id.replace(/'/g, "''")}'`);
    }
    const whereSql = filterClauses.length > 0 ? filterClauses.join(" AND ") : undefined;

    const results: SearchResult[] = [];

    if (mode === "vector" || mode === "hybrid") {
      const qVec = generateLocalEmbedding(query.query);
      let searchBuilder = this.table.search(qVec).limit(limit);
      if (whereSql) {
        searchBuilder = searchBuilder.where(whereSql);
      }
      const vecRows = await searchBuilder.toArray();
      for (const row of vecRows) {
        results.push({
          message: {
            id: row.id,
            channel_id: row.channel_id,
            guild_id: row.guild_id,
            author_id: row.author_id,
            author_name: row.author_name,
            author_bot: row.author_bot === 1,
            content: row.content,
            timestamp: row.timestamp,
            attachments_count: row.attachments_count,
            reactions_count: row.reactions_count,
            reply_to_id: row.reply_to_id,
          },
          score: (row as any)._distance !== undefined ? 1 - (row as any)._distance : 0.8,
          match_type: "vector",
        });
      }
    }

    if (mode === "fts" || (mode === "hybrid" && results.length < limit)) {
      try {
        let ftsBuilder = this.table.search(query.query).limit(limit);
        if (whereSql) {
          ftsBuilder = ftsBuilder.where(whereSql);
        }
        const ftsRows = await ftsBuilder.toArray();
        for (const row of ftsRows) {
          if (!results.some((r) => r.message.id === row.id)) {
            results.push({
              message: {
                id: row.id,
                channel_id: row.channel_id,
                guild_id: row.guild_id,
                author_id: row.author_id,
                author_name: row.author_name,
                author_bot: row.author_bot === 1,
                content: row.content,
                timestamp: row.timestamp,
                attachments_count: row.attachments_count,
                reactions_count: row.reactions_count,
                reply_to_id: row.reply_to_id,
              },
              score: 1.0,
              match_type: "fts",
            });
          }
        }
      } catch {
        // Full-text query might fall back if query syntax or index not built yet
      }
    }

    return results.slice(0, limit);
  }

  async count(): Promise<number> {
    if (!this.table) return 0;
    return await this.table.countRows();
  }

  async getRecent(limit: number = 50, channel_id?: string): Promise<DiscordMessage[]> {
    if (!this.table) return [];
    let builder = this.table.query().limit(limit);
    if (channel_id) {
      builder = builder.where(`channel_id = '${channel_id.replace(/'/g, "''")}'`);
    }
    const rows = await builder.toArray();
    return rows.map((r) => ({
      id: r.id,
      channel_id: r.channel_id,
      guild_id: r.guild_id,
      author_id: r.author_id,
      author_name: r.author_name,
      author_bot: r.author_bot === 1,
      content: r.content,
      timestamp: r.timestamp,
      attachments_count: r.attachments_count,
      reactions_count: r.reactions_count,
      reply_to_id: r.reply_to_id,
    }));
  }

  async getStats(): Promise<{
    total_messages: number;
    distinct_channels: number;
    distinct_authors: number;
    db_path: string;
  }> {
    const total = await this.count();
    const rows = await this.getRecent(1000);
    const channels = new Set(rows.map((r) => r.channel_id));
    const authors = new Set(rows.map((r) => r.author_id));

    return {
      total_messages: total,
      distinct_channels: channels.size,
      distinct_authors: authors.size,
      db_path: this.dbPath,
    };
  }
}
