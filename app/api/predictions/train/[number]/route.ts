import { getHistoryPool, isHistoryConfigured } from "@/lib/historyDb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MIN_SAMPLES_PER_BUCKET = 3; // ignore (station, day) pairs with too little signal

interface PredictionRow {
    station_code: string;
    dow: number;
    avg_delay: string | null;
    samples: string;
}

/**
 * Historical delay signal per (station, day-of-week) for one train (F4.3).
 * The frontend matches the current weekday + each upcoming stop and shows the
 * mean historical delay as an "adjusted ETA" hint next to CP's realtime ETA.
 *
 * station_code is returned in the live format ("94-NNNNN"), matching the codes
 * the frontend already has on TripStop.station.code — no normalisation needed.
 */
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
        const { rows } = await pool.query<PredictionRow>(
            `
            SELECT
                station_code,
                EXTRACT(DOW FROM arrived_at)::int  AS dow,
                AVG(delay_at_arrival_seconds)::int AS avg_delay,
                COUNT(*)::bigint                   AS samples
            FROM station_dwell_events
            WHERE train_number = $1
              AND arrived_at > NOW() - INTERVAL '60 days'
              AND delay_at_arrival_seconds IS NOT NULL
            GROUP BY station_code, EXTRACT(DOW FROM arrived_at)
            HAVING COUNT(*) >= $2
            `,
            [trainNumber, MIN_SAMPLES_PER_BUCKET],
        );

        if (rows.length === 0) {
            return new Response(null, { status: 404 });
        }

        return Response.json({
            trainNumber,
            predictions: rows.map((p) => ({
                stationCode: p.station_code,
                dayOfWeek: Number(p.dow),
                avgDelaySeconds: Number(p.avg_delay ?? 0),
                samples: Number(p.samples),
            })),
        });
    } catch (err) {
        if ((err as { code?: string }).code === "42P01") {
            // Tables not migrated yet — treat as "no data".
            return new Response(null, { status: 404 });
        }
        console.error("[predictions] query failed", err);
        return new Response("upstream error", { status: 502 });
    }
}
