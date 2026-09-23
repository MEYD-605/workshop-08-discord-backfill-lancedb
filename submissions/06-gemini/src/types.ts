export interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id: string;
  author_id: string;
  author_name: string;
  author_bot: boolean;
  content: string;
  timestamp: string;
  attachments_count: number;
  reactions_count: number;
  reply_to_id: string;
}

export interface LanceMessageRecord {
  id: string;
  channel_id: string;
  guild_id: string;
  author_id: string;
  author_name: string;
  author_bot: number; // 0 or 1 for arrow compatibility
  content: string;
  timestamp: string;
  attachments_count: number;
  reactions_count: number;
  reply_to_id: string;
  vector: number[]; // dense embedding vector
}

export interface BackfillCursor {
  channel_id: string;
  last_message_id: string;
  oldest_message_id: string;
  total_messages: number;
  updated_at: string;
}

export interface SearchQuery {
  query: string;
  channel_id?: string;
  author_id?: string;
  mode?: "hybrid" | "vector" | "fts";
  limit?: number;
}

export interface SearchResult {
  message: DiscordMessage;
  score: number;
  match_type: "vector" | "fts" | "hybrid";
}

export interface BenchmarkMetrics {
  system: "LanceDB" | "SQLite-FTS5";
  dataset_size: number;
  ingestion_time_ms: number;
  throughput_msg_per_sec: number;
  storage_bytes: number;
  fts_latency_p50_ms: number;
  fts_latency_p99_ms: number;
  vector_latency_p50_ms?: number;
  memory_rss_bytes: number;
}
