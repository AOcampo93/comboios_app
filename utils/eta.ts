import * as turf from "@turf/turf";
import type { Trip } from "@/types/cp-v2";

export interface PhysicsETA {
    etaTime: string;     // "HH:MM"
    diffSeconds: number; // physics - cp; positive = we predict later than CP
    distanceKm: number;  // distance from current position to the next stop along the route
}

/**
 * Estimate arrival at the given next stop based on the train's GPS position and speed.
 * The "route" is approximated as a polyline through the trip's stops — not the actual
 * rail geometry, but accurate enough since CP stops are typically a few km apart.
 *
 * Returns null when speed is unknown / zero, or when geometry can't be built.
 */
export function computePhysicsETA(
    trip: Trip,
    nextStopCode: string,
    vehicleLon: number,
    vehicleLat: number,
    speedKmh: number,
    cpEtaHHMM: string | null,
): PhysicsETA | null {
    if (!Number.isFinite(speedKmh) || speedKmh < 1) return null;

    const stops = trip.trainStops;
    const nextIdx = stops.findIndex((s) => s.station.code === nextStopCode);
    if (nextIdx < 0) return null;

    const coords: [number, number][] = stops
        .map(
            (s) =>
                [parseFloat(s.longitude), parseFloat(s.latitude)] as [
                    number,
                    number,
                ],
        )
        .filter(([lo, la]) => !Number.isNaN(lo) && !Number.isNaN(la));
    if (coords.length < 2) return null;

    const line = turf.lineString(coords);
    const here = turf.point([vehicleLon, vehicleLat]);
    const nextStop = turf.point([
        parseFloat(stops[nextIdx].longitude),
        parseFloat(stops[nextIdx].latitude),
    ]);

    const snapped = turf.nearestPointOnLine(line, here);
    let segment;
    try {
        segment = turf.lineSlice(snapped, nextStop, line);
    } catch {
        return null;
    }

    const distanceKm = turf.length(segment, { units: "kilometers" });
    const etaMinutesFromNow = (distanceKm / speedKmh) * 60;
    const now = Date.now();
    const etaDate = new Date(now + etaMinutesFromNow * 60_000);
    const hh = etaDate.getHours().toString().padStart(2, "0");
    const mm = etaDate.getMinutes().toString().padStart(2, "0");
    const etaTime = `${hh}:${mm}`;

    let diffSeconds = 0;
    const cp = parseHHMMToToday(cpEtaHHMM);
    if (cp) diffSeconds = Math.round((etaDate.getTime() - cp.getTime()) / 1000);

    return { etaTime, diffSeconds, distanceKm };
}

function parseHHMMToToday(hhmm: string | null): Date | null {
    if (!hhmm) return null;
    const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const d = new Date();
    d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
    // Past-midnight wraparound: if more than 6h in the past, the CP value refers to tomorrow.
    if (d.getTime() < Date.now() - 6 * 60 * 60 * 1000) {
        d.setDate(d.getDate() + 1);
    }
    return d;
}
