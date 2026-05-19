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

interface DowRow {
    dow: number; // 0 = Sunday … 6 = Saturday (Postgres EXTRACT(DOW))
    samples: string;
    avg_delay: string | null;
    on_time_pct: string | null;
}

interface LineRow {
    route_id: string;
    route_short_name: string | null;
    trip_headsign: string | null;
}

/** Per-day-of-week query, parameterised over whichever table the score came from. */
function dowQuery(source: "dwell" | "snapshots"): string {
    const [table, tsCol, delayCol] =
        source === "dwell"
            ? ["station_dwell_events", "arrived_at", "delay_at_arrival_seconds"]
            : ["train_snapshots", "ts", "delay_seconds"];
    return `
        SELECT
            EXTRACT(DOW FROM ${tsCol})::int                                                   AS dow,
            COUNT(*)::bigint                                                                  AS samples,
            AVG(${delayCol})::int                                                             AS avg_delay,
            (100.0 * SUM(CASE WHEN ${delayCol} <= $2 THEN 1 ELSE 0 END) / COUNT(*))::float    AS on_time_pct
        FROM ${table}
        WHERE train_number = $1
          AND ${tsCol} > NOW() - INTERVAL '30 days'
          AND ${delayCol} IS NOT NULL
        GROUP BY 1
        ORDER BY 1
    `;
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

        // Day-of-week breakdown (F4.1), from the same source as the headline score.
        const dowResult = await pool.query<DowRow>(dowQuery(source), [
            trainNumber,
            ON_TIME_THRESHOLD_SECONDS,
        ]);
        const byDayOfWeek = dowResult.rows.map((d) => ({
            dayOfWeek: Number(d.dow),
            samples: Number(d.samples),
            avgDelaySeconds: Number(d.avg_delay ?? 0),
            onTimePercent: Number(d.on_time_pct ?? 0),
        }));

        // Line this train belongs to, via the GTFS-derived map. Wrapped on its own
        // because a deployment that hasn't run the GTFS migration won't have the
        // table — the rest of the score should still work in that case.
        let line: {
            routeId: string;
            routeShortName: string | null;
            headsign: string | null;
        } | null = null;
        try {
            const lineResult = await pool.query<LineRow>(
                `SELECT route_id, route_short_name, trip_headsign
                 FROM train_line_map WHERE train_number = $1`,
                [trainNumber],
            );
            const lr = lineResult.rows[0];
            if (lr) {
                line = {
                    routeId: lr.route_id,
                    routeShortName: lr.route_short_name,
                    headsign: lr.trip_headsign,
                };
            }
        } catch {
            line = null; // train_line_map not present yet — non-fatal
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
            byDayOfWeek,
            line,
        });
    } catch (err) {
        console.error("[reliability] query failed", err);
        return new Response("upstream error", { status: 502 });
    }
}
