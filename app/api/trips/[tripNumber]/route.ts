import { fetchUpstream } from "@/lib/upstream";

export const revalidate = 0;

export async function GET(
    request: Request,
    { params }: { params: { tripNumber: string } },
) {
    const res = await fetchUpstream({
        workerPath: `/trips/${params.tripNumber}`,
        publicPath: `/trips/${params.tripNumber}`,
    });
    const json = await res.json();
    return Response.json(json);
}
