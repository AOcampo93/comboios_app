/**
 * Production (Joao's deployment): WORKER_BASE_URL + WORKER_KEY set → bearer-auth call to
 * the private Cloudflare Worker. The worker's root path returns vehicles, with sibling
 * routes for /stations, /stats, /trips/{id}.
 *
 * Local dev / forks without credentials: hits comboios.live's public Next.js proxy.
 * Same data, +1 hop, but the upstream caches at 7s/30s/300s so the load is negligible.
 */
type RouteSpec = {
    /** Path appended to WORKER_BASE_URL (e.g. "" for vehicles since worker root = vehicles). */
    workerPath: string;
    /** Path appended to https://comboios.live/api (e.g. "/vehicles"). */
    publicPath: string;
    /** Optional querystring without leading "?". */
    query?: string;
};

const PUBLIC_FALLBACK_BASE = "https://comboios.live/api";

export function fetchUpstream(spec: RouteSpec): Promise<Response> {
    const workerBaseUrl = process.env.WORKER_BASE_URL;
    const workerKey = process.env.WORKER_KEY;
    const useWorker = Boolean(workerBaseUrl && workerKey);

    const url = useWorker
        ? `${workerBaseUrl}${spec.workerPath}${spec.query ? `?${spec.query}` : ""}`
        : `${PUBLIC_FALLBACK_BASE}${spec.publicPath}${spec.query ? `?${spec.query}` : ""}`;

    return fetch(url, {
        headers: useWorker
            ? { Authorization: `Bearer ${workerKey}` }
            : {},
    });
}
