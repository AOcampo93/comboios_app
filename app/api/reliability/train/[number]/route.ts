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
        const { rows } = await pool.query<ReliabilityRow>(
            `
            SELECT
                COUNT(*)::bigint                                                        AS samples,
                AVG(delay_seconds)::int                                                 AS avg_delay,
                PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY delay_seconds)::int         AS p90_delay,
                (100.0 * SUM(CASE WHEN delay_seconds <= $2 THEN 1 ELSE 0 END) / COUNT(*))::float
                                                                                        AS on_time_pct,
                (EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 86400)::float                AS days_covered
            FROM train_snapshots
            WHERE train_number = $1
              AND ts > NOW() - INTERVAL '30 days'
            `,
            [trainNumber, ON_TIME_THRESHOLD_SECONDS],
        );

        const r = rows[0];
        const samples = Number(r?.samples ?? 0);
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
        });
    } catch (err) {
        console.error("[reliability] query failed", err);
        return new Response("upstream error", { status: 502 });
    }
}
