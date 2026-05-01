import { getHistoryPool, isHistoryConfigured } from "@/lib/historyDb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MIN_SAMPLES = 100; // below this, the score is statistically meaningless
const ON_TIME_THRESHOLD_SECONDS = 300; // arrived/passed within 5 min = on time

interface ReliabilityRow {
    samples: string; // pg returns BIGINT as string
    avg_delay: string | null;
    p90_delay: string | null;
    on_time_pct: string | null;
    days_covered: string | null;
}

export async function GET(
    _req: Request,
    { params }: { params: { number: string } },
) {
    if (!isHistoryConfigured()) {
        return new Response(null, { status: 404 });
    }
    const trainNumber = Number.parseInt(params.number, 10);
    if (!Number.isFinite(trainNumber)) {
        return new Response("invalid train number", { status: 400 });
    }

    const pool = getHistoryPool();
    if (!pool) return new Response(null, { status: 404 });

    try {
        // Prefer station_dwell_events: it's the long-term truth (permanent retention)
        // and one row per arrival, so each row = one observation. train_snapshots is
        // dropped after 14 days, so once the deployment matures, dwell_events covers
        // the full window. If dwell_events has too few samples (early days), fall
        // back to train_snapshots which gives finer granularity in the first 14d.
        const dwellQuery = pool.query<ReliabilityRow>(
            `
            SELECT
                COUNT(*)::bigint                                                                        AS samples,
                AVG(delay_at_arrival_seconds)::int                                                      AS avg_delay,
                PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY delay_at_arrival_seconds)::int              AS p90_delay,
                (100.0 * SUM(CASE WHEN delay_at_arrival_seconds <= $2 THEN 1 ELSE 0 END) / COUNT(*))::float
                                                                                                        AS on_time_pct,
                (EXTRACT(EPOCH FROM (MAX(arrived_at) - MIN(arrived_at))) / 86400)::float                AS days_covered
            FROM station_dwell_events
            WHERE train_number = $1
              AND arrived_at > NOW() - INTERVAL '30 days'
              AND delay_at_arrival_seconds IS NOT NULL
            `,
            [trainNumber, ON_TIME_THRESHOLD_SECONDS],
        );

        const dwellResult = await dwellQuery;
        let r = dwellResult.rows[0];
        let samples = Number(r?.samples ?? 0);
        let source: "dwell" | "snapshots" = "dwell";

        if (samples < MIN_SAMPLES) {
            // Early-deployment fallback: read directly from raw snapshots while
            // the aggregator hasn't accumulated enough events yet.
            const snapResult = await pool.query<ReliabilityRow>(
                `
                SELECT
                    COUNT(*)::bigint                                                                AS samples,
                    AVG(delay_seconds)::int                                                         AS avg_delay,
                    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY delay_seconds)::int                 AS p90_delay,
                    (100.0 * SUM(CASE WHEN delay_seconds <= $2 THEN 1 ELSE 0 END) / COUNT(*))::float
                                                                                                    AS on_time_pct,
                    (EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 86400)::float                        AS days_covered
                FROM train_snapshots
                WHERE train_number = $1
                  AND ts > NOW() - INTERVAL '30 days'
                `,
                [trainNumber, ON_TIME_THRESHOLD_SECONDS],
            );
            r = snapResult.rows[0];
            samples = Number(r?.samples ?? 0);
            source = "snapshots";
        }

        if (samples < MIN_SAMPLES) {
            return new Response(null, { status: 404 });
        }

        return Response.json({
            trainNumber,
            samples,
            onTimePercent: Number(r.on_time_pct ?? 0),
            avgDelaySeconds: Number(r.avg_delay ?? 0),
            p90DelaySeconds: Number(r.p90_delay ?? 0),
            cancellationPercent: 0, // TODO: requires status='CANCELLED' tracking in aggregates
            daysCovered: Number(r.days_covered ?? 0),
            source,
        });
    } catch (err) {
        console.error("[reliability] query failed", err);
        return new Response("upstream error", { status: 502 });
    }
}
