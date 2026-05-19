import { fetchUpstream } from "@/lib/upstream";

export const revalidate = 0;

/**
 * Next arrivals for a station, proxied from Backend A. Backend A's public proxy
 * intermittently returns an empty body (same outage that hit /trips) — when that
 * happens we must still answer with valid JSON, otherwise the caller's res.json()
 * throws "Unexpected end of JSON input". So every failure path returns
 * { arrivals: [] } rather than letting an exception escape.
 */
export async function GET(
    _request: Request,
    { params }: { params: { stationId: string } },
) {
    try {
        const res = await fetchUpstream({
            workerPath: `/stations/${params.stationId}/arrivals`,
            publicPath: `/stations/${params.stationId}/arrivals`,
        });

        if (!res.ok) {
            return Response.json({ arrivals: [] });
        }

        const text = await res.text();
        if (!text) {
            return Response.json({ arrivals: [] });
        }

        const json = JSON.parse(text);
        return Response.json({ arrivals: json.stationStops ?? [] });
    } catch (err) {
        console.error("[stations/arrivals] upstream failed", err);
        return Response.json({ arrivals: [] });
    }
}
