import { fetchUpstream } from "@/lib/upstream";

export const dynamic = "force-static";
export const revalidate = 300;

export async function GET(request: Request) {
    const res = await fetchUpstream({
        workerPath: "/stations",
        publicPath: "/stations",
    });
    const json = await res.json();
    return Response.json(json);
}
