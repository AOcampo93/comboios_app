import { getHistoryPool, isHistoryConfigured } from "@/lib/historyDb";

export const dynamic = "force-dynamic";
export const revalidate = 60;

const MIN_SAMPLES = 100;
const ON_TIME_THRESHOLD_SECONDS = 300;

interface LineStatsRow {
    samples: string;
    avg_delay: string | null;
    on_time_pct: string | null;
    train_count: number | null;
    route_short_name: string | null;
}

/**
 * Line-level punctuality (F4.2). `code` is a GTFS route_id (URL-encoded). Trains
 * are mapped to routes by train_line_map (built from GTFS trip_short_name), and
 * the same on-time stats as /api/reliability/train/[number] are aggregated over
 * every train on the route. 404 until GTFS is ingested or below MIN_SAMPLES.
 */
export async function GET(
    _req: Request,
    { params }: { params: { code: string } },
) {
    if (!isHistoryConfigured()) {
        return new Response(null, { status: 404 });
    }

    const routeId = decodeURIComponent(params.code);
    if (!routeId) {
        return new Response("invalid line code", { status: 400 });
    }

    const pool = getHistoryPool();
    if (!pool) return new Response(null, { status: 404 });

    try {
        const { rows } = await pool.query<LineStatsRow>(
            `
            SELECT
                COUNT(*)::bigint                                                                        AS samples,
                AVG(sde.delay_at_arrival_seconds)::int                                                  AS avg_delay,
                (100.0 * SUM(CASE WHEN sde.delay_at_arrival_seconds <= $2 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0))::float
                                                                                                        AS on_time_pct,
                COUNT(DISTINCT sde.train_number)::int                                                   AS train_count,
                MAX(r.route_short_name)                                                                 AS route_short_name
            FROM station_dwell_events sde
            JOIN train_line_map m ON m.train_number = sde.train_number
            LEFT JOIN gtfs_routes r ON r.route_id = m.route_id
            WHERE m.route_id = $1
              AND sde.arrived_at > NOW() - INTERVAL '30 days'
              AND sde.delay_at_arrival_seconds IS NOT NULL
            `,
            [routeId, ON_TIME_THRESHOLD_SECONDS],
        );

        const r = rows[0];
        const samples = Number(r?.samples ?? 0);
        if (samples < MIN_SAMPLES) {
            return new Response(null, { status: 404 });
        }

        return Response.json({
            routeId,
            routeShortName: r.route_short_name,
            samples,
            onTimePercent: Number(r.on_time_pct ?? 0),
            avgDelaySeconds: Number(r.avg_delay ?? 0),
            trainCount: Number(r.train_count ?? 0),
        });
    } catch (err) {
        if ((err as { code?: string }).code === "42P01") {
            return new Response(null, { status: 404 });
        }
        console.error("[stats/line] query failed", err);
        return new Response("upstream error", { status: 502 });
    }
}
