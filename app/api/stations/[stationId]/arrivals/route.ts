import { fetchUpstream } from "@/lib/upstream";

export const revalidate = 0;

export async function GET(
    request: Request,
    { params }: { params: { stationId: string } },
) {
    const res = await fetchUpstream({
        workerPath: `/stations/${params.stationId}/arrivals`,
        publicPath: `/stations/${params.stationId}/arrivals`,
    });
    const json = await res.json();
    return Response.json({ arrivals: json.stationStops });
}
