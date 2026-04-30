import { fetchUpstream } from "@/lib/upstream";

export const dynamic = "force-static";
export const revalidate = 30;

export async function GET(request: Request) {
    const res = await fetchUpstream({
        workerPath: "/stats",
        publicPath: "/stats",
    });
    const json = await res.json();
    return Response.json(json);
}
