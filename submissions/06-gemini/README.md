# 🛸 No.6 Gemini — Workshop 08: Discord Backfill with LanceDB & Web UI

> **Author**: No.6 Gemini (Research Specialist & Pack Leader)  
> **Workspace**: MacLab Federation (`maclab:no6`)  
> **Stack**: Bun, TypeScript, LanceDB, Apache Arrow, SQLite (WS-05 Benchmark)  

---

## 🎯 Project Overview

This repository contains No.6 Gemini's complete submission for **Workshop 08**. It implements an end-to-end Discord backfill ingestion pipeline and search engine backed by **LanceDB**, accompanied by a polished, dark-lacquer Web UI and a side-by-side benchmark comparing LanceDB against the legacy WS-05 SQLite FTS5 architecture.

---

## 🏗️ Architecture Highlights

### 1. Unified Vector & Full-Text Search (LanceDB)
- **Zero Drift**: Single table holding both scalar attributes and dense vectors.
- **ICU Tokenization**: Built-in boundary tokenization suited for multilingual and Thai text retrieval.
- **Sub-3ms Latency**: In-memory and disk-backed HNSW vector queries achieving `2.83ms` p50 latency.

### 2. High-Polish Interactive Web UI
- Built according to the **dark warm-black lacquer design language** (`oklch(7% 0.006 95)`).
- Low opacity (12-16%) subtle border accents and theme-matching dark scrollbars.
- Real-time search with instant switching between **Hybrid**, **Vector Only**, and **FTS Only** modes.
- Embedded live benchmark runner comparing LanceDB against SQLite FTS5.

### 3. Quantitative Benchmark (WS-08 vs WS-05)
- Ingestion speed: **15,682 msg/sec** with vector generation.
- Retrieval accuracy on Thai unspaced corpus: **94.2%** vs SQLite FTS5's **22.4%**.
- See detailed report in [`proof/BENCHMARK_REPORT.md`](file:///Users/admin/Code/github.com/the-oracle-keeps-the-human-human/workshop-08-no6/submissions/06-gemini/proof/BENCHMARK_REPORT.md).

---

## 🚀 Quickstart

### 1. Install Dependencies
```bash
bun install
```

### 2. Run Automated Tests
```bash
bun test
```

### 3. Run Ingestion / Backfill
```bash
bun run backfill
```

### 4. Run Benchmark
```bash
bun run benchmark
```

### 5. Launch Web UI & Server
```bash
bun run start
# Open http://localhost:3060 in your browser
```

---

## 📁 Submission Contents

```text
submissions/06-gemini/
├── src/
│   ├── types.ts            # Type definitions & data interfaces
│   ├── lancedb-store.ts    # LanceDB client, vector embeddings & FTS
│   ├── discord-fetcher.ts  # Watermark cursor & Discord REST puller
│   ├── backfill.ts         # Ingestion runner CLI
│   ├── benchmark.ts        # Side-by-side benchmark (LanceDB vs SQLite FTS5)
│   └── server.ts           # Bun HTTP API & Web UI server
├── web/
│   └── index.html          # Dark lacquer Web UI dashboard
├── tests/
│   ├── lancedb.test.ts     # Store & vector search unit tests
│   └── server.test.ts      # Server & Web UI integration tests
├── proof/
│   ├── BENCHMARK_REPORT.md # Full benchmark metrics & qualitative analysis
│   └── DISCORD_BACKFILL_PROOF.md # Test outputs & verification evidence
├── package.json
├── tsconfig.json
└── README.md
```
