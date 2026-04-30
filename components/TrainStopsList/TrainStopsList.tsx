"use client";

import { CaretRight } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Trip, TripStop } from "@/types/cp-v2";
import { VehicleStatus } from "@/types/cp";
import type { PhysicsETA } from "@/utils/eta";

type Marker = "past" | "current" | "next" | "future";

interface TrainStopsListProps {
    trip: Trip | undefined;
    nextStopCode: string | undefined; // raw "94_NNNNN" from gtfs.stopId
    status: VehicleStatus;
    physicsEta?: PhysicsETA | null;
}

// Convert the gtfs format ("94_31278") to the stop format ("94-31278").
function normalize(code: string | undefined): string | undefined {
    return code?.replace("_", "-");
}

function classify(
    stops: TripStop[],
    nextIdx: number,
    status: VehicleStatus,
): Marker[] {
    return stops.map((_, i) => {
        if (status === VehicleStatus.Completed) return "past";
        if (status === VehicleStatus.Cancelled) return "future";
        if (i < nextIdx) return "past";
        if (i > nextIdx) return "future";
        // i === nextIdx
        if (
            status === VehicleStatus.AtStation ||
            status === VehicleStatus.AtOrigin
        ) {
            return "current";
        }
        return "next";
    });
}

function formatDelayShort(seconds: number): string {
    if (!seconds || Math.abs(seconds) < 30) return "";
    const sign = seconds > 0 ? "+" : "−";
    const abs = Math.abs(seconds);
    const minutes = Math.round(abs / 60);
    return `${sign}${minutes}m`;
}

function StopRow({
    stop,
    marker,
}: {
    stop: TripStop;
    marker: Marker;
}) {
    // Show ETA for arrivals where there's a scheduled arrival; for the origin row
    // (no arrival) fall back to the departure ETD. Realtime values can be null —
    // in that case we just print the scheduled.
    const scheduled = stop.arrival ?? stop.departure ?? "—";
    const realtime = stop.ETA ?? stop.ETD ?? null;
    const showRealtime =
        realtime !== null &&
        realtime !== scheduled &&
        marker !== "past" &&
        marker !== "future";
    const delayLabel = formatDelayShort(stop.delay);

    const opacity =
        marker === "past" ? 0.45 : marker === "future" ? 1 : 1;
    const fontWeight =
        marker === "current" || marker === "next" ? 600 : 400;
    const accent =
        marker === "current"
            ? "#388344"
            : marker === "next"
              ? "#0b6cf2"
              : "transparent";

    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "8px 44px 1fr auto",
                alignItems: "baseline",
                columnGap: 8,
                opacity,
                fontWeight,
                fontSize: "0.78rem",
                lineHeight: 1.5,
            }}
        >
            <span
                aria-hidden
                style={{
                    width: 4,
                    height: 4,
                    borderRadius: 4,
                    background: accent,
                    transform: "translateY(-1px)",
                }}
            />
            <span style={{ fontVariantNumeric: "tabular-nums", color: "#666" }}>
                {scheduled}
            </span>
            <span
                style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
                title={stop.station.designation}
            >
                {stop.station.designation}
            </span>
            <span
                style={{
                    fontVariantNumeric: "tabular-nums",
                    color: stop.delay > 60 ? "#d7263d" : "#388344",
                    minWidth: 56,
                    textAlign: "right",
                }}
            >
                {showRealtime ? realtime : ""}
                {delayLabel ? ` ${delayLabel}` : ""}
            </span>
        </div>
    );
}

export default function TrainStopsList({
    trip,
    nextStopCode,
    status,
    physicsEta,
}: TrainStopsListProps) {
    const { t } = useTranslation();

    if (!trip || !trip.trainStops || trip.trainStops.length === 0) {
        return (
            <p style={{ fontSize: "0.75rem", color: "gray", textAlign: "center" }}>
                {t("vehicle_popup.stops.loading")}
            </p>
        );
    }

    const target = normalize(nextStopCode);
    let nextIdx = trip.trainStops.findIndex((s) => s.station.code === target);
    if (nextIdx < 0) {
        // Fallback: if we can't match, treat NOT_STARTED as 0, COMPLETED as last,
        // anything else as 0 (will mark first stop as next, less wrong than -1).
        nextIdx =
            status === VehicleStatus.Completed
                ? trip.trainStops.length - 1
                : 0;
    }

    const markers = classify(trip.trainStops, nextIdx, status);
    const highlight = trip.trainStops[nextIdx];

    return (
        <div style={{ width: "100%", marginTop: 6 }}>
            {highlight && (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        padding: "6px 8px",
                        marginBottom: 6,
                        borderRadius: 6,
                        background: "rgba(11,108,242,0.08)",
                        fontSize: "0.82rem",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        <CaretRight size={14} weight="bold" />
                        <span style={{ fontWeight: 700 }}>
                            {markers[nextIdx] === "current"
                                ? t("vehicle_popup.stops.current")
                                : t("vehicle_popup.stops.next")}
                            :
                        </span>
                        <span
                            style={{
                                flex: 1,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {highlight.station.designation}
                        </span>
                        <span
                            style={{
                                fontVariantNumeric: "tabular-nums",
                                fontWeight: 700,
                            }}
                        >
                            {highlight.ETA ?? highlight.ETD ?? "—"}
                        </span>
                    </div>
                    {physicsEta && (
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: "0.7rem",
                                color:
                                    Math.abs(physicsEta.diffSeconds) > 120
                                        ? "#d97706"
                                        : "#666",
                                paddingLeft: 20,
                            }}
                        >
                            <span>
                                {t("vehicle_popup.stops.physics_eta")}:
                            </span>
                            <span
                                style={{
                                    fontVariantNumeric: "tabular-nums",
                                    fontWeight: 600,
                                }}
                            >
                                {physicsEta.etaTime}
                            </span>
                            <span
                                style={{
                                    fontVariantNumeric: "tabular-nums",
                                    opacity: 0.8,
                                }}
                            >
                                ({physicsEta.distanceKm.toFixed(1)} km
                                {physicsEta.diffSeconds !== 0 &&
                                    `, ${physicsEta.diffSeconds > 0 ? "+" : "−"}${Math.round(Math.abs(physicsEta.diffSeconds) / 60)}m vs CP`}
                                )
                            </span>
                        </div>
                    )}
                </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {trip.trainStops.map((stop, i) => (
                    <StopRow
                        key={`${stop.station.code}-${i}`}
                        stop={stop}
                        marker={markers[i]}
                    />
                ))}
            </div>
        </div>
    );
}
