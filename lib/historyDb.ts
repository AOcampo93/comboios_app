import pg from "pg";

// Backend B (history). Optional: if DATABASE_URL is unset (local dev or Joao's
// production without the scraper), endpoints gracefully return 404 instead of crashing.
let _pool: pg.Pool | null = null;

export function getHistoryPool(): pg.Pool | null {
    if (_pool) return _pool;
    const url = process.env.DATABASE_URL;
    if (!url) return null;
    _pool = new pg.Pool({
        connectionString: url,
        max: 4,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    });
    _pool.on("error", (err) => {
        // Don't crash the Next.js server on transient DB issues.
        console.error("[history-db] pool error", err);
    });
    return _pool;
}

export function isHistoryConfigured(): boolean {
    return Boolean(process.env.DATABASE_URL);
}
