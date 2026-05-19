import { getHistoryPool, isHistoryConfigured } from "@/lib/historyDb";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const MIN_SAMPLES = 3; // stations seen fewer times than this are noise

interface DwellRow {
    station_code: string;
    avg_dwell: string | null;
    avg_excess: string | null;
    samples: string;
    excess_samples: string;
}

/**
 * Dwell heatmap (F5.2): per-station averages from station_dwell_events over the
 * last 30 days. `avgExcessSeconds` (real dwell minus GTFS-scheduled dwell) is the
 * metric the frontend colours stations by; `avgDwellSeconds` is the raw fallback.
 *
 * Returns data keyed by stationCode only — the frontend already has station
 * coordinates from /api/stations and joins them client-side.
 */
export async function GET() {
    if (!isHistoryConfigured()) {
        return new Response(null, { status: 404 });
    }

    const pool = getHistoryPool();
    if (!pool) return new Response(null, { status: 404 });

    try {
        const { rows } = await pool.query<DwellRow>(
            `
            SELECT
                station_code,
                AVG(dwell_seconds)::int    AS avg_dwell,
                AVG(excess_seconds)::int   AS avg_excess,
                COUNT(*)::bigint           AS samples,
                COUNT(excess_seconds)::bigint AS excess_samples
            FROM station_dwell_events
            WHERE arrived_at > NOW() - INTERVAL '30 days'
              AND dwell_seconds IS NOT NULL
            GROUP BY station_code
            HAVING COUNT(*) >= $1
            `,
            [MIN_SAMPLES],
        );

        return Response.json({
            stations: rows.map((r) => ({
                stationCode: r.station_code,
                avgDwellSeconds: Number(r.avg_dwell ?? 0),
                // null when no row for this station has a GTFS-scheduled dwell yet
                avgExcessSeconds:
                    Number(r.excess_samples) > 0
                        ? Number(r.avg_excess ?? 0)
                        : null,
                samples: Number(r.samples),
            })),
        });
    } catch (err) {
        if ((err as { code?: string }).code === "42P01") {
            return new Response(null, { status: 404 });
        }
        console.error("[heatmap/dwell] query failed", err);
        return new Response("upstream error", { status: 502 });
    }
}
