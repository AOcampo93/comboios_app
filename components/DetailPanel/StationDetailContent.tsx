"use client";

import { useTranslation } from "react-i18next";
import { ArrowRight, CaretRight } from "@phosphor-icons/react";
import { TrainIcon } from "lucide-react";
import { EnrichedVehicle, Station, TrainArrival } from "@/types/cp-v2";
import Pill, { BadgeColor } from "@/components/Pill/Pill";
import Loader from "@/components/Loader/Loader";
import ArrivingBusAnimation from "@/components/ArrivingBusAnimation/ArrivingBusAnimation";
import StationReliabilityPanel from "@/components/StationReliabilityPanel/StationReliabilityPanel";

type Arrival = TrainArrival & { durationToArrivalMinutes?: number };

interface Props {
    station: Station;
    arrivals: Arrival[] | null;
    isLoadingArrivals: boolean;
    vehicles: EnrichedVehicle[] | null;
    onFlyToTrain: (trainNumber: number) => void;
}

const sectionLabelStyle: React.CSSProperties = {
    fontWeight: 700,
    fontSize: "0.8rem",
    color: "gray",
    textTransform: "uppercase",
};

/**
 * Station details for the unified DetailPanel: header, the live next-arrivals
 * list, and the historical punctuality panel. Plain flow layout, shared by the
 * desktop side panel and the mobile bottom sheet.
 */
export default function StationDetailContent({
    station,
    arrivals,
    isLoadingArrivals,
    vehicles,
    onFlyToTrain,
}: Props) {
    const { t } = useTranslation();

    return (
        <div>
            <p style={sectionLabelStyle}>
                {t("station_popup.station_header")}
            </p>
            <h1 style={{ fontWeight: 900, fontSize: "1.1rem" }}>
                {station.designation}
            </h1>
            <p style={{ color: "gray", opacity: 0.5, marginTop: 6 }}>
                {"ID: " + station.code}
            </p>

            <div style={{ height: 15 }} />

            {isLoadingArrivals ? (
                <Loader />
            ) : arrivals?.length === 0 ? (
                <p style={sectionLabelStyle}>
                    {t("station_popup.no_arrivals")}
                </p>
            ) : (
                <>
                    <p style={sectionLabelStyle}>
                        {t("station_popup.next_arrivals")}
                    </p>
                    <div style={{ height: 5 }} />
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                        }}
                    >
                        {arrivals?.map((arrival) => {
                            const isLive = !!vehicles?.find(
                                (v) => v.trainNumber === arrival.trainNumber,
                            );
                            return (
                                <div
                                    key={arrival.trainNumber}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                            minWidth: 0,
                                        }}
                                    >
                                        <Pill color={BadgeColor.green}>
                                            <p style={{ fontSize: 11 }}>
                                                {`${arrival.trainService.code} ${arrival.trainNumber}`}
                                            </p>
                                        </Pill>
                                        <ArrowRight size={15} weight="bold" />
                                        <p
                                            style={{
                                                fontWeight: "bold",
                                                fontSize: "0.8rem",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {
                                                arrival.trainDestination
                                                    .designation
                                            }
                                        </p>
                                    </div>
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 5,
                                            flexShrink: 0,
                                        }}
                                    >
                                        <p
                                            style={{
                                                fontWeight: "bold",
                                                color: "green",
                                            }}
                                        >
                                            {arrival.durationToArrivalMinutes !=
                                                null &&
                                            arrival.durationToArrivalMinutes <=
                                                0 ? (
                                                <ArrivingBusAnimation color="green" />
                                            ) : (
                                                `${arrival.durationToArrivalMinutes} min`
                                            )}
                                        </p>
                                        {isLive && (
                                            <button
                                                onClick={() =>
                                                    onFlyToTrain(
                                                        arrival.trainNumber,
                                                    )
                                                }
                                                style={{ cursor: "pointer" }}
                                            >
                                                <Pill
                                                    color={BadgeColor.green}
                                                    wrapping
                                                >
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                            gap: 5,
                                                            padding: "0 5px",
                                                        }}
                                                    >
                                                        <TrainIcon
                                                            color="white"
                                                            size={12}
                                                        />
                                                        <CaretRight
                                                            size={15}
                                                        />
                                                    </div>
                                                </Pill>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            <StationReliabilityPanel stationCode={station.code} />
        </div>
    );
}
