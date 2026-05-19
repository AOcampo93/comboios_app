"use client";

import { useTranslation } from "react-i18next";
import { useReliability, type DayOfWeekScore } from "@/hooks/useReliability";

interface Props {
    trainNumber: number | undefined;
}

// Postgres EXTRACT(DOW) is 0 = Sunday … 6 = Saturday. Render Monday-first.
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const TRACK_HEIGHT = 44;

function pickColor(onTimePercent: number): string {
    if (onTimePercent >= 85) return "#388344"; // green
    if (onTimePercent >= 65) return "#d97706"; // amber
    return "#d7263d"; // red
}

function formatSignedDelay(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes === 0) return "0m";
    return `${minutes > 0 ? "+" : "−"}${Math.abs(minutes)}m`;
}

/**
 * Day-of-week reliability breakdown for one train (F4.1). Reads Backend B via
 * `useReliability` (deduped with ReliabilityBadge — one request). Renders a
 * 7-bar on-time chart plus the headline avg/p90 delay. Returns null when there
 * is no historical data, so callers can drop it in unconditionally.
 */
export default function ReliabilityPanel({ trainNumber }: Props) {
    const { t } = useTranslation();
    const { score } = useReliability(trainNumber);

    if (!score || score.samples === 0 || !score.byDayOfWeek?.length) {
        return null;
    }

    const byDow = new Map<number, DayOfWeekScore>(
        score.byDayOfWeek.map((d) => [d.dayOfWeek, d]),
    );

    return (
        <div
            style={{
                marginTop: 10,
                padding: "8px 10px",
                borderRadius: 8,
                background: "rgba(11,108,242,0.06)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 8,
                }}
            >
                <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>
                    {t("reliability.byday_title")}
                </span>
                {score.line?.routeShortName && (
                    <span
                        style={{
                            fontSize: "0.68rem",
                            color: "#666",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 160,
                        }}
                        title={score.line.headsign ?? undefined}
                    >
                        {score.line.routeShortName}
                    </span>
                )}
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gap: 4,
                }}
            >
                {DOW_ORDER.map((dow) => {
                    const d = byDow.get(dow);
                    const label = t(`reliability.weekday.${dow}`);
                    const barColor = d
                        ? pickColor(d.onTimePercent)
                        : "transparent";
                    const barHeight = d
                        ? Math.max(
                              3,
                              (d.onTimePercent / 100) * TRACK_HEIGHT,
                          )
                        : 0;
                    return (
                        <div
                            key={dow}
                            title={
                                d
                                    ? `${Math.round(d.onTimePercent)}% · ${d.samples} obs · ${formatSignedDelay(d.avgDelaySeconds)}`
                                    : t("reliability.byday_none")
                            }
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 3,
                            }}
                        >
                            <div
                                style={{
                                    height: TRACK_HEIGHT,
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "flex-end",
                                    borderRadius: 3,
                                    background: "rgba(0,0,0,0.06)",
                                    overflow: "hidden",
                                }}
                            >
                                <div
                                    style={{
                                        width: "100%",
                                        height: barHeight,
                                        background: barColor,
                                    }}
                                />
                            </div>
                            <span
                                style={{
                                    fontSize: "0.6rem",
                                    color: d ? "#444" : "#bbb",
                                    fontWeight: 600,
                                }}
                            >
                                {label}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 8,
                    fontSize: "0.66rem",
                    color: "#666",
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                <span>
                    {t("reliability.panel_avg")}:{" "}
                    {formatSignedDelay(score.avgDelaySeconds)} · P90{" "}
                    {formatSignedDelay(score.p90DelaySeconds)}
                </span>
                <span>
                    {t("reliability.panel_samples", {
                        samples: score.samples,
                        days: Math.round(score.daysCovered),
                    })}
                </span>
            </div>
        </div>
    );
}
