import { getHistoryPool, isHistoryConfigured } from "@/lib/historyDb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface HistoryRow {
    ts: string;
    lon: number;
    lat: number;
    delay_seconds: number | null;
    speed_decikmh: number | null;
    status: string;
    next_station: string | null;
}

/**
 * Last N snapshots for a train, used by the frontend for trajectory replay /
 * detail-on-demand. Default and max limited to keep payloads small.
 */
export async function GET(
    req: Request,
    { params }: { params: { number: string } },
) {
    if (!isHistoryConfigured()) {
        return new Response(null, { status: 404 });
    }
    const trainNumber = Number.parseInt(params.number, 10);
    if (!Number.isFinite(trainNumber)) {
        return new Response("invalid train number", { status: 400 });
    }

    const url = new URL(req.url);
    const limit = Math.min(
        500,
        Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "100", 10)),
    );

    const pool = getHistoryPool();
    if (!pool) return new Response(null, { status: 404 });

    try {
        const { rows } = await pool.query<HistoryRow>(
            `
            SELECT
                ts,
                ST_X(position::geometry) AS lon,
                ST_Y(position::geometry) AS lat,
                delay_seconds,
                speed_decikmh,
                status,
                next_station
            FROM train_snapshots
            WHERE train_number = $1
            ORDER BY ts DESC
            LIMIT $2
            `,
            [trainNumber, limit],
        );

        if (rows.length === 0) {
            return new Response(null, { status: 404 });
        }

        return Response.json({
            trainNumber,
            count: rows.length,
            snapshots: rows.map((r) => ({
                ts: r.ts,
                lon: r.lon,
                lat: r.lat,
                delaySeconds: r.delay_seconds,
                speedKmh:
                    r.speed_decikmh != null ? r.speed_decikmh / 10 : null,
                status: r.status,
                nextStation: r.next_station,
            })),
        });
    } catch (err) {
        console.error("[history] query failed", err);
        return new Response("upstream error", { status: 502 });
    }
}
