import { getHistoryPool, isHistoryConfigured } from "@/lib/historyDb";

export const dynamic = "force-dynamic";
export const revalidate = 300; // segment speeds move slowly; cache 5 min

interface SpeedRow {
    from_station: string;
    to_station: string;
    geojson: string; // ST_AsGeoJSON output
    avg_speed: string | null;
    samples: string;
}

/**
 * Speed heatmap (F5.1) as a GeoJSON FeatureCollection of LineStrings, one per
 * physical (from_station → to_station) pair. Geometry is the GPS-traced polyline
 * from segment_paths; avgSpeedKmh is averaged over every run in route_segments.
 * The frontend colours each line by avgSpeedKmh.
 */
export async function GET() {
    if (!isHistoryConfigured()) {
        return new Response(null, { status: 404 });
    }

    const pool = getHistoryPool();
    if (!pool) return new Response(null, { status: 404 });

    try {
        // Drop rows whose polyline is essentially a straight chord between two
        // distant stations: the aggregator builds segment_paths from raw GPS
        // pings and accepts as few as 2 points, so a journey with sparse GPS
        // (or a teleport) produces a long diagonal across the country. A real
        // rail track of any length curves enough to be >3% longer than the
        // straight-line distance; under that we treat it as a GPS-gap artefact.
        const { rows } = await pool.query<SpeedRow>(
            `
            SELECT
                sp.from_station,
                sp.to_station,
                ST_AsGeoJSON(sp.geometry) AS geojson,
                agg.avg_speed,
                agg.samples
            FROM segment_paths sp
            JOIN (
                SELECT
                    from_station,
                    to_station,
                    AVG(avg_speed_kmh)::float AS avg_speed,
                    COUNT(*)::bigint          AS samples
                FROM route_segments
                WHERE avg_speed_kmh IS NOT NULL
                  AND avg_speed_kmh > 0
                GROUP BY from_station, to_station
            ) agg
              ON agg.from_station = sp.from_station
             AND agg.to_station   = sp.to_station
            WHERE NOT (
                ST_Distance(
                    ST_StartPoint(sp.geometry::geometry)::geography,
                    ST_EndPoint(sp.geometry::geometry)::geography
                ) > 8000
                AND ST_Length(sp.geometry)
                    <= ST_Distance(
                        ST_StartPoint(sp.geometry::geometry)::geography,
                        ST_EndPoint(sp.geometry::geometry)::geography
                    ) * 1.03
            )
            `,
        );

        return Response.json({
            type: "FeatureCollection",
            features: rows.map((r) => ({
                type: "Feature",
                geometry: JSON.parse(r.geojson),
                properties: {
                    fromStation: r.from_station,
                    toStation: r.to_station,
                    avgSpeedKmh: Number(r.avg_speed ?? 0),
                    samples: Number(r.samples),
                },
            })),
        });
    } catch (err) {
        if ((err as { code?: string }).code === "42P01") {
            return new Response(null, { status: 404 });
        }
        console.error("[heatmap/speed] query failed", err);
        return new Response("upstream error", { status: 502 });
    }
}
