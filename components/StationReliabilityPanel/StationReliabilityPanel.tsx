"use client";

import { useTranslation } from "react-i18next";
import { useStationReliability } from "@/hooks/useStationReliability";

interface Props {
    stationCode: string | undefined;
}

const ON_TIME_THRESHOLD_SECONDS = 300; // matches the Backend B query

function pickColor(onTimePercent: number): string {
    if (onTimePercent >= 85) return "#388344"; // green
    if (onTimePercent >= 65) return "#d97706"; // amber
    return "#d7263d"; // red
}

function verdictKey(onTimePercent: number): string {
    if (onTimePercent >= 85) return "station_reliability.verdict_good";
    if (onTimePercent >= 65) return "station_reliability.verdict_mixed";
    return "station_reliability.verdict_bad";
}

function formatSignedDelay(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes === 0) return "0m";
    return `${minutes > 0 ? "+" : "−"}${Math.abs(minutes)}m`;
}

function formatClock(iso: string): string {
    return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}

/**
 * Station-level punctuality (F4 — station view). Reads Backend B via
 * `useStationReliability` and renders, for the selected station: the share of
 * trains that arrive on time, a plain-language verdict, and a list of recent
 * arrivals showing scheduled vs real time. Returns null when Backend B has no
 * history for the station, so callers can drop it in unconditionally.
 */
export default function StationReliabilityPanel({ stationCode }: Props) {
    const { t } = useTranslation();
    const { score } = useStationReliability(stationCode);

    if (!score || score.samples === 0) {
        return null;
    }

    const color = pickColor(score.onTimePercent);

    return (
        <div
            style={{
                marginTop: 15,
                padding: "8px 10px",
                borderRadius: 8,
                background: "rgba(11,108,242,0.06)",
            }}
        >
            <div
                style={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    marginBottom: 6,
                }}
            >
                {t("station_reliability.title")}
            </div>

            <div
                style={{ display: "flex", alignItems: "baseline", gap: 6 }}
            >
                <span
                    style={{
                        fontSize: "1.5rem",
                        fontWeight: 900,
                        color,
                        lineHeight: 1,
                    }}
                >
                    {Math.round(score.onTimePercent)}%
                </span>
                <span style={{ fontSize: "0.72rem", color: "#666" }}>
                    {t("station_reliability.on_time")}
                </span>
            </div>

            <div
                style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color,
                    marginTop: 3,
                }}
            >
                {t(verdictKey(score.onTimePercent))}
            </div>

            <div
                style={{
                    fontSize: "0.66rem",
                    color: "#666",
                    marginTop: 4,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {t("station_reliability.summary", {
                    avg: formatSignedDelay(score.avgDelaySeconds),
                    trains: score.distinctTrains,
                    samples: score.samples,
                    days: Math.round(score.daysCovered),
                })}
            </div>

            {score.recentArrivals.length > 0 && (
                <>
                    <div
                        style={{
                            fontSize: "0.66rem",
                            fontWeight: 700,
                            color: "#888",
                            textTransform: "uppercase",
                            marginTop: 8,
                            marginBottom: 4,
                        }}
                    >
                        {t("station_reliability.recent_title")}
                    </div>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 3,
                        }}
                    >
                        {score.recentArrivals.map((a) => {
                            const real = new Date(a.arrivedAt);
                            const scheduled = new Date(
                                real.getTime() - a.delaySeconds * 1000,
                            ).toISOString();
                            const onTime =
                                a.delaySeconds <= ON_TIME_THRESHOLD_SECONDS;
                            return (
                                <div
                                    key={`${a.trainNumber}-${a.arrivedAt}`}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        fontSize: "0.68rem",
                                        fontVariantNumeric: "tabular-nums",
                                    }}
                                >
                                    <span
                                        style={{
                                            fontWeight: 700,
                                            color: "#444",
                                            minWidth: 44,
                                        }}
                                    >
                                        {a.trainNumber}
                                    </span>
                                    <span style={{ color: "#888" }}>
                                        {formatClock(scheduled)}
                                    </span>
                                    <span style={{ color: "#bbb" }}>→</span>
                                    <span
                                        style={{
                                            fontWeight: 700,
                                            color: "#222",
                                        }}
                                    >
                                        {formatClock(a.arrivedAt)}
                                    </span>
                                    <span
                                        style={{
                                            fontWeight: 700,
                                            minWidth: 36,
                                            textAlign: "right",
                                            color: onTime
                                                ? "#388344"
                                                : "#d7263d",
                                        }}
                                    >
                                        {formatSignedDelay(a.delaySeconds)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
