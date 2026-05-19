"use client";

import useSWR from "swr";

// Backend B. 404 means "no history for this station yet" — return null so the
// caller can drop the panel; SWR shouldn't retry forever on that.
async function fetcher(url: string): Promise<StationReliability | null> {
    const res = await fetch(url);
    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return (await res.json()) as StationReliability;
}

export interface StationArrival {
    trainNumber: number;
    arrivedAt: string; // ISO timestamp of the real arrival
    delaySeconds: number; // scheduled time = arrivedAt − delaySeconds
}

export interface StationReliability {
    stationCode: string;
    samples: number; // total arrivals observed in the last 30 days
    distinctTrains: number; // how many different trains the station handled
    onTimePercent: number; // 0–100
    avgDelaySeconds: number;
    p90DelaySeconds: number;
    daysCovered: number;
    recentArrivals: StationArrival[];
}

export interface StationReliabilityState {
    /** Loaded stats, or null if Backend B has no data for this station. */
    score: StationReliability | null;
    /** True while SWR is fetching for the first time. */
    loading: boolean;
}

/**
 * Station punctuality stats from Backend B (F4 — station view). Deduped so the
 * station popup and any other consumer share a single request per station.
 */
export function useStationReliability(
    stationCode: string | undefined,
): StationReliabilityState {
    const { data, isLoading } = useSWR<StationReliability | null>(
        stationCode
            ? `/api/reliability/station/${encodeURIComponent(stationCode)}`
            : null,
        fetcher,
        {
            // Slow-moving data; long dedupe avoids hammering Backend B.
            dedupingInterval: 10 * 60_000,
            revalidateOnFocus: false,
            shouldRetryOnError: false,
        },
    );

    return { score: data ?? null, loading: isLoading };
}
