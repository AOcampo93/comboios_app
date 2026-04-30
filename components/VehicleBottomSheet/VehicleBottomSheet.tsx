"use client";

import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import { ArrowDown, ArrowRight, ArrowUp, X } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { EnrichedVehicle, Trip } from "@/types/cp-v2";
import { VehicleStatus } from "@/types/cp";
import { formatDuration, scheduledDwellSeconds } from "@/utils/time";
import TrainStopsList from "@/components/TrainStopsList/TrainStopsList";
import StationDwellTimer from "@/components/StationDwellTimer/StationDwellTimer";
import ReliabilityBadge from "@/components/ReliabilityBadge/ReliabilityBadge";
import type { PhysicsETA } from "@/utils/eta";

interface Props {
    vehicle: EnrichedVehicle | null;
    trip: Trip | undefined;
    physicsEta: PhysicsETA | null;
    arrivedAt: number | undefined;
    onClose: () => void;
}

// Three snap points as fractions of viewport height: peek / mid / full.
const SNAP_POINTS: (number | string)[] = [0.18, 0.55, 0.92];

export default function VehicleBottomSheet({
    vehicle,
    trip,
    physicsEta,
    arrivedAt,
    onClose,
}: Props) {
    const { t } = useTranslation();
    const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[1]);

    const open = vehicle !== null;
    useEffect(() => {
        if (open) setSnap(SNAP_POINTS[1]);
    }, [open]);

    if (!vehicle) return null;

    const dwellSeconds =
        (vehicle.status === VehicleStatus.AtOrigin ||
            vehicle.status === VehicleStatus.AtStation) &&
        arrivedAt
            ? scheduledDwellSeconds(
                  trip?.trainStops.find(
                      (s) => s.station.code === vehicle.lastStation,
                  )?.arrival ?? null,
                  trip?.trainStops.find(
                      (s) => s.station.code === vehicle.lastStation,
                  )?.departure ?? null,
              )
            : null;

    return (
        <Drawer.Root
            open={open}
            onOpenChange={(o) => !o && onClose()}
            snapPoints={SNAP_POINTS}
            activeSnapPoint={snap}
            setActiveSnapPoint={setSnap}
            modal={false}
        >
            <Drawer.Portal>
                <Drawer.Content
                    aria-describedby={undefined}
                    style={{
                        position: "fixed",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        zIndex: 50,
                        background: "var(--bg, #fff)",
                        color: "var(--fg, #000)",
                        borderTopLeftRadius: 16,
                        borderTopRightRadius: 16,
                        boxShadow:
                            "0 -8px 24px rgba(0,0,0,0.15), 0 -2px 8px rgba(0,0,0,0.08)",
                        height: "92vh",
                        display: "flex",
                        flexDirection: "column",
                        outline: "none",
                    }}
                >
                    {/* Drag handle */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            padding: "8px 0 4px",
                            flexShrink: 0,
                        }}
                    >
                        <div
                            style={{
                                width: 40,
                                height: 4,
                                borderRadius: 4,
                                background: "rgba(0,0,0,0.2)",
                            }}
                        />
                    </div>

                    <Drawer.Title style={{ display: "none" }}>
                        {t("vehicle_popup.train", {
                            trainNumber: vehicle.trainNumber,
                        })}
                    </Drawer.Title>

                    {/* Always-visible header: train + delay + close. ~110px tall to fit in peek. */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0 16px 8px",
                            flexShrink: 0,
                        }}
                    >
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    fontSize: "1.1rem",
                                    fontWeight: 800,
                                }}
                            >
                                {t("vehicle_popup.train", {
                                    trainNumber: vehicle.trainNumber,
                                })}
                                {vehicle.delayTrend === "up" && (
                                    <ArrowUp
                                        size={14}
                                        weight="bold"
                                        color="#d7263d"
                                    />
                                )}
                                {vehicle.delayTrend === "down" && (
                                    <ArrowDown
                                        size={14}
                                        weight="bold"
                                        color="#388344"
                                    />
                                )}
                                <ReliabilityBadge
                                    trainNumber={vehicle.trainNumber}
                                />
                            </div>
                            <div
                                style={{
                                    fontSize: "0.82rem",
                                    color: "#666",
                                    marginTop: 2,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {vehicle.delay > 0 &&
                                    t("vehicle_popup.schedule_adherence.late", {
                                        formattedDuration: formatDuration(
                                            vehicle.delay,
                                            true,
                                        ),
                                    })}
                                {vehicle.delay < 0 &&
                                    t(
                                        "vehicle_popup.schedule_adherence.early",
                                        {
                                            formattedDuration: formatDuration(
                                                Math.abs(vehicle.delay),
                                                true,
                                            ),
                                        },
                                    )}
                                {vehicle.delay === 0 &&
                                    t("vehicle_popup.schedule_adherence.on_time")}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            style={{
                                width: 44,
                                height: 44,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "transparent",
                                border: 0,
                                borderRadius: 22,
                                cursor: "pointer",
                                color: "#666",
                            }}
                        >
                            <X size={18} weight="bold" />
                        </button>
                    </div>

                    {/* Origin → destination strip, visible from peek */}
                    {vehicle.origin && vehicle.destination && (
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                                padding: "0 16px 12px",
                                fontSize: "0.85rem",
                                color: "#666",
                                flexShrink: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            <span
                                style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {vehicle.origin.designation}
                            </span>
                            <ArrowRight size={12} weight="bold" />
                            <span
                                style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {vehicle.destination.designation}
                            </span>
                        </div>
                    )}

                    {/* Dwell timer when at station */}
                    {arrivedAt &&
                        (vehicle.status === VehicleStatus.AtOrigin ||
                            vehicle.status === VehicleStatus.AtStation) && (
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "center",
                                    paddingBottom: 8,
                                    flexShrink: 0,
                                }}
                            >
                                <StationDwellTimer
                                    arrivedAt={arrivedAt}
                                    scheduledDwellSeconds={dwellSeconds}
                                />
                            </div>
                        )}

                    {/* Scrollable content: stops list */}
                    <div
                        style={{
                            flex: 1,
                            overflowY: "auto",
                            padding: "0 16px 24px",
                            WebkitOverflowScrolling: "touch",
                        }}
                    >
                        <TrainStopsList
                            trip={trip}
                            nextStopCode={vehicle.gtfs?.stopId ?? undefined}
                            status={vehicle.status}
                            physicsEta={physicsEta}
                        />
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}
