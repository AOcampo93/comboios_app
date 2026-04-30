"use client";

import { ChartBar, Hourglass } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useReliability } from "@/hooks/useReliability";

interface Props {
    trainNumber: number | undefined;
}

function pickColor(onTimePercent: number): string {
    if (onTimePercent >= 85) return "#388344"; // green
    if (onTimePercent >= 65) return "#d97706"; // amber
    return "#d7263d"; // red
}

export default function ReliabilityBadge({ trainNumber }: Props) {
    const { t } = useTranslation();
    const { score, accumulating, daysUntilReady } = useReliability(trainNumber);

    // Backend B has data: render real score.
    if (score && score.samples > 0) {
        const color = pickColor(score.onTimePercent);
        return (
            <div
                title={t("reliability.tooltip", {
                    samples: score.samples,
                    days: score.daysCovered,
                })}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: `${color}15`,
                    color,
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                <ChartBar size={11} weight="fill" />
                {Math.round(score.onTimePercent)}%
            </div>
        );
    }

    // Pre-launch: data still accumulating. Show a quiet placeholder so users
    // (and reviewers of the PR) know the feature is wired and will light up.
    if (accumulating) {
        return (
            <div
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: "rgba(0,0,0,0.05)",
                    color: "#888",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                }}
                title={t("reliability.accumulating_tooltip", {
                    days: daysUntilReady,
                })}
            >
                <Hourglass size={11} />
                {t("reliability.accumulating", { days: daysUntilReady })}
            </div>
        );
    }

    // Window passed but Backend B returned no data for this specific train.
    return null;
}
