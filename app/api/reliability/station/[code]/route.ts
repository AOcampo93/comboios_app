import { getHistoryPool, isHistoryConfigured } from "@/lib/historyDb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MIN_SAMPLES = 5; // below this the punctuality average is just noise
const ON_TIME_THRESHOLD_SECONDS = 300; // arrived within 5 min = on time
const RECENT_LIMIT = 8; // how many recent arrivals to list (scheduled vs real)

interface SummaryRow {
    samples: string; // pg returns BIGINT as string
    distinct_trains: string;
    avg_delay: string | null;
    p90_delay: string | null;
    on_time_pct: string | null;
    days_covered: string | null;
}

interface RecentRow {
    train_number: number;
    arrived_at: string; // ISO timestamp
    delay_at_arrival_seconds: number;
}

/**
 * Station-level punctuality (Backend B). Aggregates station_dwell_events over
 * the last 30 days for one station: how many trains it has handled and whether
 * they arrive on time, plus a list of recent arrivals with scheduled vs real
 * times. The scheduled time is reconstructed as arrived_at − delay.
 *
 * 404 when the DB is unconfigured, the table isn't migrated, or there are fewer
 * than MIN_SAMPLES observations — the frontend treats 404 as "not yet" and
 * simply hides the panel (same contract as /api/reliability/train).
 */
export async function GET(
    _req: Request,
    { params }: { params: { code: string } },
) {
    if (!isHistoryConfigured()) {
        return new Response(null, { status: 404 });
    }

    const stationCode = params.code?.trim();
    if (!stationCode) {
        return new Response("invalid station code", { status: 400 });
    }

    const pool = getHistoryPool();
    if (!pool) return new Response(null, { status: 404 });

    try {
        const summary = await pool.query<SummaryRow>(
            `
            SELECT
                COUNT(*)::bigint                                                                        AS samples,
                COUNT(DISTINCT train_number)::bigint                                                    AS distinct_trains,
                AVG(delay_at_arrival_seconds)::int                                                      AS avg_delay,
                PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY delay_at_arrival_seconds)::int              AS p90_delay,
                (100.0 * SUM(CASE WHEN delay_at_arrival_seconds <= $2 THEN 1 ELSE 0 END) / COUNT(*))::float
                                                                                                        AS on_time_pct,
                (EXTRACT(EPOCH FROM (MAX(arrived_at) - MIN(arrived_at))) / 86400)::float                AS days_covered
            FROM station_dwell_events
            WHERE station_code = $1
              AND arrived_at > NOW() - INTERVAL '30 days'
              AND delay_at_arrival_seconds IS NOT NULL
            `,
            [stationCode, ON_TIME_THRESHOLD_SECONDS],
        );

        const r = summary.rows[0];
        const samples = Number(r?.samples ?? 0);
        if (samples < MIN_SAMPLES) {
            return new Response(null, { status: 404 });
        }

        const recent = await pool.query<RecentRow>(
            `
            SELECT train_number, arrived_at, delay_at_arrival_seconds
            FROM station_dwell_events
            WHERE station_code = $1
              AND arrived_at > NOW() - INTERVAL '30 days'
              AND delay_at_arrival_seconds IS NOT NULL
            ORDER BY arrived_at DESC
            LIMIT $2
            `,
            [stationCode, RECENT_LIMIT],
        );

        return Response.json({
            stationCode,
            samples,
            distinctTrains: Number(r.distinct_trains ?? 0),
            onTimePercent: Number(r.on_time_pct ?? 0),
            avgDelaySeconds: Number(r.avg_delay ?? 0),
            p90DelaySeconds: Number(r.p90_delay ?? 0),
            daysCovered: Number(r.days_covered ?? 0),
            recentArrivals: recent.rows.map((a) => ({
                trainNumber: Number(a.train_number),
                arrivedAt: new Date(a.arrived_at).toISOString(),
                delaySeconds: Number(a.delay_at_arrival_seconds),
            })),
        });
    } catch (err) {
        if ((err as { code?: string }).code === "42P01") {
            // station_dwell_events not migrated yet — degrade to "not yet".
            return new Response(null, { status: 404 });
        }
        console.error("[reliability/station] query failed", err);
        return new Response("upstream error", { status: 502 });
    }
}
