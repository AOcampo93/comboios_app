"use client";

import { useTranslation } from "react-i18next";
import {
    ArrowDown,
    ArrowRight,
    ArrowUp,
    Gauge,
    Sparkle,
    Train,
} from "@phosphor-icons/react";
import { EnrichedVehicle, Station, Trip } from "@/types/cp-v2";
import { VehicleStatus } from "@/types/cp";
import { formatDuration, scheduledDwellSeconds } from "@/utils/time";
import { getFormattedFleetNumber } from "@/utils/fleet";
import type { PhysicsETA } from "@/utils/eta";
import Pill, { BadgeColor } from "@/components/Pill/Pill";
import TrainStopsList from "@/components/TrainStopsList/TrainStopsList";
import StationDwellTimer from "@/components/StationDwellTimer/StationDwellTimer";
import ReliabilityBadge from "@/components/ReliabilityBadge/ReliabilityBadge";
import ReliabilityPanel from "@/components/ReliabilityPanel/ReliabilityPanel";

interface Props {
    vehicle: EnrichedVehicle;
    trip: Trip | undefined;
    physicsEta: PhysicsETA | null;
    arrivedAt: number | undefined;
    stations: Station[] | undefined;
}

const statusTextStyle: React.CSSProperties = {
    color: "gray",
    fontSize: "0.8rem",
    fontWeight: 700,
    textTransform: "uppercase",
    textAlign: "center",
};

/**
 * Train details for the unified DetailPanel. A plain top-to-bottom flow layout
 * (no absolute positioning) so it renders the same in the desktop side panel
 * and the mobile bottom sheet.
 */
export default function VehicleDetailContent({
    vehicle,
    trip,
    physicsEta,
    arrivedAt,
    stations,
}: Props) {
    const { t } = useTranslation();

    const atStation =
        vehicle.status === VehicleStatus.AtOrigin ||
        vehicle.status === VehicleStatus.AtStation;

    const lastStop = trip?.trainStops.find(
        (s) => s.station.code === vehicle.lastStation,
    );

    const stationName = (code: string | undefined | null) =>
        code
            ? stations?.find((s) => s.code === code)?.designation ?? ""
            : "";

    return (
        <div>
            {/* Header: train number + delay trend + reliability + units */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                    }}
                >
                    <h1 style={{ fontWeight: 900, fontSize: "1.1rem" }}>
                        {t("vehicle_popup.train", {
                            trainNumber: vehicle.trainNumber,
                        })}
                    </h1>
                    {vehicle.delayTrend === "up" && (
                        <ArrowUp size={14} weight="bold" color="#d7263d" />
                    )}
                    {vehicle.delayTrend === "down" && (
                        <ArrowDown size={14} weight="bold" color="#388344" />
                    )}
                    <ReliabilityBadge trainNumber={vehicle.trainNumber} />
                </div>
                {vehicle.units && vehicle.units.length > 0 && (
                    <Pill color={BadgeColor.green} wrapping>
                        <div className="flex items-center gap-1 pr-2 pl-2">
                            <Train size={15} />
                            <p>
                                {vehicle.units
                                    .map((u) => getFormattedFleetNumber(u))
                                    .join(" + ")}
                            </p>
                        </div>
                    </Pill>
                )}
            </div>

            {/* Schedule adherence */}
            <p
                style={{
                    fontWeight: 700,
                    fontSize: "0.8rem",
                    color: "gray",
                    marginTop: 4,
                }}
            >
                {vehicle.delay === 0 &&
                    t("vehicle_popup.schedule_adherence.on_time")}
                {vehicle.delay > 0 &&
                    t("vehicle_popup.schedule_adherence.late", {
                        formattedDuration: formatDuration(vehicle.delay, true),
                    })}
                {vehicle.delay < 0 &&
                    t("vehicle_popup.schedule_adherence.early", {
                        formattedDuration: formatDuration(
                            Math.abs(vehicle.delay),
                            true,
                        ),
                    })}
            </p>

            {/* Occupancy */}
            {!!vehicle.occupancy && (
                <p
                    className={`font-bold ${
                        vehicle.occupancy < 65
                            ? "text-green-500"
                            : vehicle.occupancy < 85
                              ? "text-yellow-500"
                              : "text-red-500"
                    }`}
                    style={{ fontSize: "0.82rem", marginTop: 4 }}
                >
                    {vehicle.occupancy < 65
                        ? "Muitos lugares disponíveis"
                        : vehicle.occupancy < 85
                          ? "Poucos lugares sentados"
                          : "Comboio cheio"}{" "}
                    ({vehicle.occupancy}% ocupado)
                </p>
            )}

            {/* Service + speed pills */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 10,
                }}
            >
                {vehicle.service?.designation && (
                    <Pill color={BadgeColor.subtleGreen}>
                        <div className="flex items-center gap-1">
                            <p>
                                {vehicle.service.designation.replace(
                                    "(Alta Qualidade)",
                                    "",
                                )}
                            </p>
                            {vehicle.service.designation.endsWith(
                                "(Alta Qualidade)",
                            ) && <Sparkle size={15} weight="fill" />}
                        </div>
                    </Pill>
                )}
                {"speed" in vehicle && (
                    <Pill>
                        <Gauge size={15} />
                        <div style={{ width: 7 }} />
                        {vehicle.speed?.toFixed(1)}
                        <div style={{ width: 7 }} />
                        <p>km/h</p>
                    </Pill>
                )}
            </div>

            {/* Origin → destination */}
            {vehicle.origin?.designation &&
                vehicle.destination?.designation && (
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: 10,
                            marginTop: 10,
                        }}
                    >
                        <span style={{ fontSize: "1rem" }}>
                            {vehicle.origin.designation}
                        </span>
                        <ArrowRight size={15} weight="bold" />
                        <span style={{ fontSize: "1rem" }}>
                            {vehicle.destination.designation}
                        </span>
                    </div>
                )}

            {/* Status line */}
            <div style={{ marginTop: 8 }}>
                {vehicle.status === VehicleStatus.Completed && (
                    <p style={statusTextStyle}>
                        {t("vehicle_popup.status.completed")}
                    </p>
                )}
                {vehicle.status === VehicleStatus.NotStarted && (
                    <p style={statusTextStyle}>
                        {t("vehicle_popup.status.not_started")}
                    </p>
                )}
                {vehicle.status === VehicleStatus.InTransit && (
                    <p style={statusTextStyle}>
                        {t("vehicle_popup.status.in_transit")}
                    </p>
                )}
                {vehicle.status === VehicleStatus.NearNext && (
                    <p style={statusTextStyle}>
                        {t("vehicle_popup.status.near_next")}
                        {(() => {
                            const name = stationName(
                                vehicle.gtfs?.stopId?.replace("_", "-"),
                            );
                            return name ? ` (${name})` : "";
                        })()}
                    </p>
                )}
                {vehicle.status === VehicleStatus.Cancelled && (
                    <p style={{ ...statusTextStyle, color: "#d7263d" }}>
                        {t("vehicle_popup.status.cancelled")}
                    </p>
                )}
                {atStation && (
                    <>
                        <p style={statusTextStyle}>
                            {vehicle.status === VehicleStatus.AtOrigin
                                ? t("vehicle_popup.status.at_origin")
                                : t("vehicle_popup.status.at_station")}
                            {(() => {
                                const name = stationName(vehicle.lastStation);
                                return name ? ` (${name})` : "";
                            })()}
                        </p>
                        {arrivedAt && (
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "center",
                                    marginTop: 4,
                                }}
                            >
                                <StationDwellTimer
                                    arrivedAt={arrivedAt}
                                    scheduledDwellSeconds={scheduledDwellSeconds(
                                        lastStop?.arrival ?? null,
                                        lastStop?.departure ?? null,
                                    )}
                                />
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Stops list */}
            <div style={{ marginTop: 8 }}>
                <TrainStopsList
                    trip={trip}
                    nextStopCode={vehicle.gtfs?.stopId ?? undefined}
                    status={vehicle.status}
                    physicsEta={physicsEta}
                />
            </div>

            <ReliabilityPanel trainNumber={vehicle.trainNumber} />

            {/* Footer: freshness + source */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 14,
                    fontSize: "0.7rem",
                    color: "gray",
                }}
            >
                {vehicle.timestamp && (
                    <span>
                        {t("vehicle_popup.updated_at")}:{" "}
                        {new Date(vehicle.timestamp).toLocaleTimeString()}
                    </span>
                )}
                {vehicle.source && <span>via {vehicle.source}</span>}
            </div>
        </div>
    );
}
