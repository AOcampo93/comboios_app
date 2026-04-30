import { getHistoryPool, isHistoryConfigured } from "@/lib/historyDb";

export const dynamic = "force-dynamic";
export const revalidate = 60;

/**
 * Line-level punctuality stats. Currently a placeholder — the line→train mapping
 * comes from CP's GTFS routes.txt which we don't yet ingest. The endpoint is wired
 * so the frontend can attach to it; it returns 404 until the mapping lands.
 */
export async function GET(
    _req: Request,
    { params }: { params: { code: string } },
) {
    if (!isHistoryConfigured()) {
        return new Response(null, { status: 404 });
    }

    // TODO: when GTFS line metadata is ingested, query train_snapshots filtered by
    // the trains belonging to this line and aggregate the same stats as
    // /api/reliability/train/[number] but grouped over many trains.
    void params.code;
    return new Response(null, { status: 404 });
}
