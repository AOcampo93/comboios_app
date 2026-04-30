import { fetchUpstream } from "@/lib/upstream";

export const dynamic = "force-static";
export const revalidate = 7;

export async function GET(request: Request) {
    const res = await fetchUpstream({
        workerPath: "",
        publicPath: "/vehicles",
        query: "excludes=completed",
    });
    const json = await res.json();
    return Response.json(json);
}
