"use client";

import useSWR from "swr";

// Backend B endpoints will live under /api/history/* and /api/reliability/* (F3.6).
// Until those are wired up they return 404; SWR shouldn't retry forever.
async function fetcher(url: string): Promise<ReliabilityScore | null> {
    const res = await fetch(url);
    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return (await res.json()) as ReliabilityScore;
}

export interface ReliabilityScore {
    trainNumber: number;
    samples: number;
    onTimePercent: number;       // 0–100
    avgDelaySeconds: number;
    p90DelaySeconds: number;
    cancellationPercent: number; // 0–100
    daysCovered: number;
}

const HISTORY_START =
    process.env.NEXT_PUBLIC_HISTORY_START_DATE ?? "2026-05-01";
const REQUIRED_DAYS = 30;

export interface ReliabilityState {
    /** Loaded score, or null if Backend B has no data for this train yet. */
    score: ReliabilityScore | null;
    /** True while we're still in the 30-day accumulation window. */
    accumulating: boolean;
    /** Days remaining until reliability is considered meaningful. */
    daysUntilReady: number;
    /** True while SWR is fetching for the first time. */
    loading: boolean;
}

export function useReliability(trainNumber: number | undefined): ReliabilityState {
    const { data, isLoading } = useSWR<ReliabilityScore | null>(
        trainNumber != null
            ? `/api/reliability/train/${trainNumber}`
            : null,
        fetcher,
        {
            // Reliability data is slow-moving; long dedupe avoids hammering the BE.
            dedupingInterval: 10 * 60_000,
            revalidateOnFocus: false,
            shouldRetryOnError: false,
        },
    );

    const startMs = new Date(HISTORY_START).getTime();
    const elapsedDays = Math.max(
        0,
        Math.floor((Date.now() - startMs) / (24 * 3600 * 1000)),
    );
    const daysUntilReady = Math.max(0, REQUIRED_DAYS - elapsedDays);
    const accumulating = daysUntilReady > 0;

    return {
        score: data ?? null,
        accumulating,
        daysUntilReady,
        loading: isLoading,
    };
}
