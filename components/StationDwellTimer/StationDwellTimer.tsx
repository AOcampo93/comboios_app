"use client";

import { useEffect, useState } from "react";
import { Timer, Warning } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

interface Props {
    arrivedAt: number; // ms timestamp when we first observed the train at this station
    scheduledDwellSeconds?: number | null;
}

function formatShort(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

export default function StationDwellTimer({
    arrivedAt,
    scheduledDwellSeconds,
}: Props) {
    const { t } = useTranslation();
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const elapsed = Math.floor((now - arrivedAt) / 1000);
    const exceeded =
        scheduledDwellSeconds != null &&
        scheduledDwellSeconds > 0 &&
        elapsed > scheduledDwellSeconds;

    return (
        <div
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                marginTop: 4,
                borderRadius: 6,
                background: exceeded
                    ? "rgba(215,38,61,0.10)"
                    : "rgba(56,131,68,0.10)",
                color: exceeded ? "#d7263d" : "#388344",
                fontSize: "0.78rem",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
            }}
        >
            {exceeded ? <Warning size={13} weight="fill" /> : <Timer size={13} />}
            <span>{formatShort(elapsed)}</span>
            {scheduledDwellSeconds != null && scheduledDwellSeconds > 0 && (
                <span style={{ opacity: 0.7, fontWeight: 400 }}>
                    / {formatShort(scheduledDwellSeconds)}{" "}
                    {t("vehicle_popup.dwell.scheduled")}
                </span>
            )}
        </div>
    );
}
