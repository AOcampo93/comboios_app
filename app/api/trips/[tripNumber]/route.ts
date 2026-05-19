import { fetchUpstream } from "@/lib/upstream";
import { getHistoryPool, isHistoryConfigured } from "@/lib/historyDb";

export const revalidate = 0;

// Weekday columns in gtfs_calendar, indexed by JS getDay() (0 = Sunday).
const WEEKDAY_COLUMN = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
] as const;

interface GtfsStopRow {
    stop_id: string;
    stop_name: string;
    stop_lat: number | null;
    stop_lon: number | null;
    stop_sequence: number;
    arrival_time: string | null;
    departure_time: string | null;
}

/** GTFS clock string ("HH:MM:SS", possibly ≥ 24:00:00) → display "HH:MM". */
function gtfsTimeToHHMM(t: string | null): string | null {
    if (!t) return null;
    const [h, m] = t.split(":");
    const hour = Number.parseInt(h, 10) % 24;
    return `${String(hour).padStart(2, "0")}:${m ?? "00"}`;
}

/**
 * Builds a Trip-shaped object from Backend B's static GTFS schedule
 * (gtfs_trips + gtfs_stop_times + gtfs_stops) for one train number. Used as a
 * fallback when Backend A's realtime /trips endpoint returns an empty trip.
 *
 * The schedule has no realtime fields, so ETA/ETD/delay are left null/0 — the
 * stops list already renders the scheduled time when realtime is absent.
 * stop_id is converted "94_NNNNN" → "94-NNNNN" to match the live station-code
 * format the rest of the app (and the heatmap/predictions joins) expect.
 */
async function buildTripFromGtfs(
    trainNumber: number,
): Promise<Record<string, unknown> | null> {
    const pool = getHistoryPool();
    if (!pool) return null;

    try {
        // Pick the trip variant whose service runs today, when the calendar
        // lets us tell; otherwise any variant (the stop list rarely differs).
        const weekdayCol = WEEKDAY_COLUMN[new Date().getDay()];
        const tripRes = await pool.query<{ trip_id: string }>(
            `SELECT t.trip_id
             FROM gtfs_trips t
             LEFT JOIN gtfs_calendar c ON c.service_id = t.service_id
             WHERE t.trip_short_name = $1
             ORDER BY (c.${weekdayCol} = 1) DESC NULLS LAST, t.trip_id
             LIMIT 1`,
            [String(trainNumber)],
        );
        const tripId = tripRes.rows[0]?.trip_id;
        if (!tripId) return null;

        const { rows } = await pool.query<GtfsStopRow>(
            `SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon,
                    st.stop_sequence, st.arrival_time, st.departure_time
             FROM gtfs_stop_times st
             JOIN gtfs_stops s ON s.stop_id = st.stop_id
             WHERE st.trip_id = $1
             ORDER BY st.stop_sequence`,
            [tripId],
        );
        if (rows.length === 0) return null;

        const trainStops = rows.map((r, i) => ({
            station: {
                code: r.stop_id.replace("_", "-"),
                designation: r.stop_name,
            },
            arrival: i === 0 ? null : gtfsTimeToHHMM(r.arrival_time),
            departure:
                i === rows.length - 1
                    ? null
                    : gtfsTimeToHHMM(r.departure_time),
            platform: null,
            latitude: r.stop_lat != null ? String(r.stop_lat) : "",
            longitude: r.stop_lon != null ? String(r.stop_lon) : "",
            delay: 0,
            supression: null,
            ETA: null,
            ETD: null,
        }));

        return {
            trainNumber,
            serviceCode: { code: "", designation: "" },
            lastStationCode: trainStops[0]?.station.code ?? "",
            delay: 0,
            occupancy: null,
            latitude: null,
            longitude: null,
            status: "",
            hasDisruptions: null,
            duration: "",
            messages: [],
            trainStops,
            // Marks the schedule-only fallback so the client could badge it.
            source: "gtfs-schedule",
        };
    } catch (err) {
        // Tables not migrated / transient DB issue — fall through to Backend A.
        console.error("[trips] GTFS fallback failed", err);
        return null;
    }
}

export async function GET(
    _request: Request,
    { params }: { params: { tripNumber: string } },
) {
    const res = await fetchUpstream({
        workerPath: `/trips/${params.tripNumber}`,
        publicPath: `/trips/${params.tripNumber}`,
    });
    const json = await res.json().catch(() => null);

    const hasRealtimeStops =
        json &&
        Array.isArray((json as { trainStops?: unknown[] }).trainStops) &&
        (json as { trainStops: unknown[] }).trainStops.length > 0;

    // Backend A gave us a real trip — use it as-is.
    if (hasRealtimeStops) {
        return Response.json(json);
    }

    // Backend A returned an empty trip. If Backend B (the scraper's GTFS) is
    // configured, serve the static schedule so the stops list, route heatmap
    // and adjusted-ETA hints still light up.
    const trainNumber = Number.parseInt(params.tripNumber, 10);
    if (isHistoryConfigured() && Number.isFinite(trainNumber)) {
        const gtfsTrip = await buildTripFromGtfs(trainNumber);
        if (gtfsTrip) return Response.json(gtfsTrip);
    }

    // Never let a missing trainStops escape — the client does
    // `selectedTrip.trainStops.find(...)` without a guard, so an undefined array
    // would crash the page. Always return a Trip-shaped object with stops:[].
    const safe = (json && typeof json === "object" ? json : {}) as Record<
        string,
        unknown
    >;
    if (!Array.isArray(safe.trainStops)) {
        safe.trainStops = [];
    }
    return Response.json(safe);
}
