"use client";

import useSWR from "swr";

export interface StationPrediction {
    stationCode: string;
    dayOfWeek: number; // 0 = Sunday … 6 = Saturday
    avgDelaySeconds: number;
    samples: number;
}

interface PredictionsResponse {
    trainNumber: number;
    predictions: StationPrediction[];
}

// Backend B (history). 404 = no data for this train yet — treat as empty,
// don't retry forever.
async function fetcher(url: string): Promise<PredictionsResponse | null> {
    const res = await fetch(url);
    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return (await res.json()) as PredictionsResponse;
}

export interface PredictionsState {
    /** Historical delay per station for *today's* weekday, keyed by station code. */
    byStationToday: Map<string, StationPrediction>;
    /** True once Backend B has returned a (non-404) payload. */
    hasData: boolean;
    loading: boolean;
}

/**
 * Historical mean delay per (station, day-of-week) for one train (F4.3).
 * Filters the payload down to the current weekday so the stops list can show
 * an "adjusted ETA" hint next to each upcoming stop. Empty when Backend B has
 * no data — the UI then simply omits the hint.
 */
export function usePredictions(
    trainNumber: number | undefined,
): PredictionsState {
    const { data, isLoading } = useSWR<PredictionsResponse | null>(
        trainNumber != null ? `/api/predictions/train/${trainNumber}` : null,
        fetcher,
        {
            // Slow-moving aggregate; long dedupe avoids hammering Backend B.
            dedupingInterval: 10 * 60_000,
            revalidateOnFocus: false,
            shouldRetryOnError: false,
        },
    );

    const todayDow = new Date().getDay(); // 0 = Sunday … 6 = Saturday
    const byStationToday = new Map<string, StationPrediction>();
    for (const p of data?.predictions ?? []) {
        if (p.dayOfWeek === todayDow) byStationToday.set(p.stationCode, p);
    }

    return {
        byStationToday,
        hasData: Boolean(data),
        loading: isLoading,
    };
}
