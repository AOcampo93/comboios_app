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
        // Drop rows whose polyline is a sparse-GPS artefact: the aggregator
        // accepts as few as 2 points, so a leg with few intermediate GPS pings
        // (or a teleport) becomes a long diagonal across the country.
        //
        // Signal: vertices-per-km. A real GPS trace at 10–30 s polling has
        // 1–5 pts/km even at full speed. Anything below 0.5 pts/km over a
        // chord >5 km is almost certainly a GPS gap, regardless of how noisy
        // the few samples were. This catches both the strictly-straight case
        // (path ≈ chord, ratio 1.00) and the slightly-noisy case (path 5–10 %
        // > chord) that the previous ratio-only filter missed.
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
                  -- Cap apparent speed at CP's fastest train (Alfa Pendular,
                  -- ~220 km/h). Anything above is a GPS teleport artefact and
                  -- pollutes both the avg colour and the heatmap distribution.
                  AND avg_speed_kmh <= 220
                GROUP BY from_station, to_station
            ) agg
              ON agg.from_station = sp.from_station
             AND agg.to_station   = sp.to_station
            WHERE
                -- Hard cap on chord length: no two consecutive stations in
                -- the Portuguese rail network sit > 50 km apart, so any
                -- segment_path with a longer chord is an express-service leg
                -- where the aggregator collapsed several skipped stations
                -- into one giant straight diagonal. Drop them entirely.
                ST_Distance(
                    ST_StartPoint(sp.geometry::geometry)::geography,
                    ST_EndPoint(sp.geometry::geometry)::geography
                ) <= 50000
                -- Density filter: drop sparse GPS traces with < 0.5
                -- vertices/km over a chord > 5 km.
                AND NOT (
                    ST_Distance(
                        ST_StartPoint(sp.geometry::geometry)::geography,
                        ST_EndPoint(sp.geometry::geometry)::geography
                    ) > 5000
                    AND ST_NumPoints(sp.geometry::geometry) <
                        (ST_Distance(
                            ST_StartPoint(sp.geometry::geometry)::geography,
                            ST_EndPoint(sp.geometry::geometry)::geography
                        ) / 1000.0) * 0.5
                )
                -- Straight-chord filter for short artefacts (3–50 km) that
                -- slipped past the density cut: ratio path/chord ≤ 1.03 plus
                -- density < 5 pts/km flags GPS traces that draw as a straight
                -- diagonal over actual track curves. The density floor of 5
                -- protects OSM-routed seed paths (dense by construction)
                -- from being filtered for being legitimately straight.
                AND NOT (
                    ST_Distance(
                        ST_StartPoint(sp.geometry::geometry)::geography,
                        ST_EndPoint(sp.geometry::geometry)::geography
                    ) > 3000
                    AND ST_Length(sp.geometry)
                        <= ST_Distance(
                            ST_StartPoint(sp.geometry::geometry)::geography,
                            ST_EndPoint(sp.geometry::geometry)::geography
                        ) * 1.03
                    AND ST_NumPoints(sp.geometry::geometry) <
                        (ST_Distance(
                            ST_StartPoint(sp.geometry::geometry)::geography,
                            ST_EndPoint(sp.geometry::geometry)::geography
                        ) / 1000.0) * 5
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
