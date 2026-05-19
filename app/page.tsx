"use strict";
"use client";

import * as turf from "@turf/turf";
import {
    LineString,
    MultiLineString,
    Feature,
    Point,
    FeatureCollection,
} from "geojson";

// function splitLineStringByClosestPoint(lineString: LineString, point: Point) {
//     const closestPoint = turf.nearestPointOnLine(lineString, point);

//     const lines = turf.lineSplit(lineString, closestPoint);

//     return lines;
// }

function getCalculatedHeading(
    previousCoordinates: number[],
    currentCoordinates: number[]
): number {
    const bearing = turf.bearing(
        turf.point(previousCoordinates),
        turf.point(currentCoordinates)
    );
    return (bearing + 360) % 360;
}

// function getPopupAnchorForHeading(heading: number): PositionAnchor {
//     if (heading >= 45 && heading < 135) {
//         return "top";
//     } else if (heading >= 135 && heading < 225) {
//         return "right";
//     } else if (heading >= 225 && heading < 315) {
//         return "left";
//     } else {
//         return "bottom";
//     }
// }

import WGLMap from "@/components/WGLMap/WGLMap";
import {
    useMap,
    Source,
    Layer,
    CircleLayer,
    Popup,
    LineLayer,
    SymbolLayer,
} from "react-map-gl/maplibre";
import {
    LngLatBoundsLike,
    MapGeoJSONFeature,
    MapLayerMouseEvent,
    PositionAnchor,
} from "maplibre-gl";
import useSWR from "swr";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
} from "react";
import {
    ArrowRight,
    CaretRight,
    ChartBar,
    Eye,
    Gauge,
    GithubLogo,
    Globe,
    Info,
    MagnifyingGlass,
    MapPinSimple,
    Moon,
    Path,
    Sun,
    Ticket,
} from "@phosphor-icons/react";

import { Toaster, toast } from "sonner";

import Pill, { BadgeColor } from "@/components/Pill/Pill";
import Loader from "@/components/Loader/Loader";
import Centered from "@/components/Centered/Centered";
import FadeInOut, { Fade } from "@/components/FadeInOut/FadeInOut";

import pkgInfo from "../package.json";
import TopBarButton from "@/components/TopBarButton/TopBarButton";
import { useTheme } from "next-themes";
import InfoDialog from "@/components/InfoDialog/InfoDialog";
// import CPLogo from "@/components/CPLogo";
import ArrivingBusAnimation from "@/components/ArrivingBusAnimation/ArrivingBusAnimation";
import BusIcon from "@/components/BusIcon";
import { Service, TrainStop, VehicleStatus } from "@/types/cp";
import {
    Station,
    EnrichedVehicle,
    GeneralStatistics,
    TrainArrival,
    Trip,
} from "@/types/cp-v2";
import DetailPanel from "@/components/DetailPanel/DetailPanel";
import VehicleDetailContent from "@/components/DetailPanel/VehicleDetailContent";
import StationDetailContent from "@/components/DetailPanel/StationDetailContent";
import SearchOverlay from "@/components/search/SearchBarOverlay/SearchBarOverlay";
import { parseHHMM } from "@/utils/time";
import { computePhysicsETA, type PhysicsETA } from "@/utils/eta";
import { Train } from "lucide-react";
import { useTranslation } from "react-i18next";
import dynamic from "next/dynamic";
// import { BottomSheet } from "@/components/BottomSheet/BottomSheet";
// import GeneralStatisticsOverlay from "@/components/stats/GeneralStatisticsOverlay";

const unauthenticatedFetcher = (url: string) =>
    fetch(url).then((res) => res.json());

interface GeoJSON {
    type: string;
    features: GeoJSONFeature[];
}

interface GeoJSONFeature {
    type: string;
    geometry: {
        coordinates: number[] | number[][];
        type: string;
    };
    properties?:
        | (EnrichedVehicle & { type: string })
        | (Station & { type: string });
}

function trackUmamiEvent(eventName: string, eventData?: Record<string, any>) {
    if (typeof window !== "undefined" && (window as any).umami) {
        (window as any).umami.track(eventName, eventData);
    }
}

function Home() {
    const { t, i18n } = useTranslation();
    const { data: version } = useSWR("/api/version", unauthenticatedFetcher, {
        refreshInterval: 30_000,
    });

    useEffect(() => {
        if (version && version.version !== pkgInfo.version) {
            // running different version than the latest one
            window.location.reload();
        }
    }, [version]);

    const { theme, resolvedTheme, setTheme } = useTheme();

    const [vehicles, _setVehicles] = useState<EnrichedVehicle[] | null>(null);

    const [showPopup, setShowPopup] = useState<boolean>(true);
    const [selectedVehicle, setSelectedVehicle] =
        useState<EnrichedVehicle | null>(null);

    const [showStationPopup, setShowStationPopup] = useState<boolean>(false);
    const [selectedStation, setSelectedStation] = useState<Station | null>(
        null,
    );

    const [selectedStationNextArrivals, _setSelectedStationNextArrivals] =
        useState<
            (TrainArrival & { durationToArrivalMinutes?: number })[] | null
        >(null);

    const selectedStationNextArrivalsRef = useRef(selectedStationNextArrivals);
    const setSelectedStationNextArrivals = (
        data: (TrainArrival & { durationToArrivalMinutes?: number })[] | null,
    ) => {
        selectedStationNextArrivalsRef.current = data;
        _setSelectedStationNextArrivals(data);
    };

    const [isLoadingArrivals, setIsLoadingArrivals] = useState<boolean>(false);

    const [cursor, setCursor] = useState<string>("auto");

    const [isLoading, _setIsLoading] = useState<boolean>(true);

    const [isSSEErrored, _setIsSSEErrored] = useState<boolean>(false);

    const [showSearchOverlay, setShowSearchOverlay] = useState<boolean>(false);
    const [showStatsOverlay, setShowStatsOverlay] = useState<boolean>(false);

    // Per-train historical heatmap (F5): the selected train's route coloured by
    // average speed + its stops coloured by dwell-excess. Off by default,
    // toggled from the top bar while a train is selected.
    const [showRouteHeatmap, setShowRouteHeatmap] = useState<boolean>(false);

    const [activeBottomSheetDetent, setActiveBottomSheetDetent] =
        useState<number>(0);

    // Keyboard shortcut for search overlay (cmd+k / ctrl+j)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey && e.key === "k") || (e.ctrlKey && e.key === "j")) {
                e.preventDefault();
                setShowSearchOverlay(true);
                trackUmamiEvent("search_overlay_opened", {
                    source: "keyboard_shortcut",
                    shortcut: e.metaKey && e.key === "k" ? "cmd+k" : "ctrl+j",
                });
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const onMouseEnter = useCallback(() => setCursor("pointer"), []);
    const onMouseLeave = useCallback(() => setCursor("auto"), []);

    // const [isMapLoading, setIsMapLoading] = useState<boolean>(true);

    const { map } = useMap();

    useEffect(() => {
        if (map) {
            map.loadImage("arrow.png").then((res) =>
                map.addImage("arrow", res.data, { sdf: true }),
            );

            map.loadImage("cp_vehicle_oriented_w_inv.png").then((res) =>
                map.addImage("bus", res.data),
            );
        }
    }, [map]);

    // useEffect(() => {
    //     setIsMapLoading(!map?.loaded());
    // }, [map?.loaded()]);

    const [toastId, _setToastId] = useState<string | number | null>(null);

    const toastIdRef = useRef(toastId);
    const setToastId = (data: string | number | null) => {
        toastIdRef.current = data;
        _setToastId(data);
    };

    const isSSEErroredRef = useRef(isSSEErrored);
    const setIsSSEErrored = (data: boolean) => {
        isSSEErroredRef.current = data;
        _setIsSSEErrored(data);
    };

    const isLoadingRef = useRef(isLoading);
    const setIsLoading = (data: boolean) => {
        isLoadingRef.current = data;
        _setIsLoading(data);
    };

    const vehiclesRef = useRef(vehicles);
    const setVehicles = (data: EnrichedVehicle[] | null) => {
        vehiclesRef.current = data;
        _setVehicles(data);
    };

    const prevPositionsRef = useRef<Map<number, [number, number]>>(new Map());
    // Anchored delay per train: only updated when |new - anchor| > DELAY_TREND_THRESHOLD,
    // so small jitter doesn't flicker the arrow and a slow climb still triggers "up".
    const prevDelaysRef = useRef<Map<number, number>>(new Map());

    // First-seen-at-station timestamps; persisted to sessionStorage so a refresh
    // doesn't reset the dwell counter while a train is still parked.
    const ARRIVAL_KEY = "comboios:arrivalTimestamps";
    const arrivalTimestampsRef = useRef<Map<number, number>>(new Map());

    useEffect(() => {
        if (typeof window === "undefined") return;
        const raw = window.sessionStorage.getItem(ARRIVAL_KEY);
        if (!raw) return;
        try {
            const obj = JSON.parse(raw) as Record<string, number>;
            const map = new Map<number, number>();
            for (const [k, v] of Object.entries(obj)) {
                map.set(Number(k), v);
            }
            arrivalTimestampsRef.current = map;
        } catch {
            // ignore corrupt sessionStorage
        }
    }, []);

    const { data: newVehicles } = useSWR<{
        vehicles: EnrichedVehicle[];
    }>("/api/vehicles", unauthenticatedFetcher, {
        refreshInterval: 5_000,
    });

    const { data: stations } = useSWR<{
        stations: Station[];
    }>("/api/stations", unauthenticatedFetcher, {
        refreshInterval: 240_000,
    });

    const { data: stats } = useSWR<{
        stats: GeneralStatistics;
    }>("/api/stats", unauthenticatedFetcher, {
        refreshInterval: 60_000,
    });

    // Network heatmap. Global — when toggled it shows the whole rail network
    // coloured by speed plus every station, with no dependency on a selected
    // train or on Backend A being reachable.
    const heatmapActive = showRouteHeatmap;

    // Fetched unconditionally: the network geometry is also used to draw the
    // highlighted rail track outline when the heatmap toggle is OFF.
    const { data: speedHeatmap } = useSWR<FeatureCollection>(
        "/api/heatmap/speed",
        unauthenticatedFetcher,
        { refreshInterval: 300_000 },
    );

    const { data: dwellHeatmap } = useSWR<{
        stations: {
            stationCode: string;
            avgDwellSeconds: number;
            avgExcessSeconds: number | null;
            samples: number;
        }[];
    }>(heatmapActive ? "/api/heatmap/dwell" : null, unauthenticatedFetcher, {
        refreshInterval: 300_000,
    });

    const { data: selectedTrip } = useSWR<Trip>(
        selectedVehicle
            ? `/api/trips/${selectedVehicle.trainNumber}`
            : null,
        unauthenticatedFetcher,
        { refreshInterval: 30_000 },
    );

    const arrivedAtSelected = selectedVehicle
        ? arrivalTimestampsRef.current.get(selectedVehicle.trainNumber)
        : undefined;

    const physicsEtaSelected: PhysicsETA | null = (() => {
        if (!selectedVehicle || !selectedTrip) return null;
        const lon = parseFloat(selectedVehicle.longitude);
        const lat = parseFloat(selectedVehicle.latitude);
        const speed = selectedVehicle.speed;
        const nextCode = selectedVehicle.gtfs?.stopId?.replace("_", "-");
        if (
            !nextCode ||
            speed == null ||
            Number.isNaN(lon) ||
            Number.isNaN(lat)
        ) {
            return null;
        }
        const cpEta =
            selectedTrip.trainStops.find((s) => s.station.code === nextCode)
                ?.ETA ?? null;
        return computePhysicsETA(
            selectedTrip,
            nextCode,
            lon,
            lat,
            speed,
            cpEta,
        );
    })();

    useEffect(() => {
        console.log(isLoading);
        if (newVehicles?.vehicles) {
            isLoading && setIsLoading(false);

            const DELAY_TREND_THRESHOLD = 30; // seconds
            const prevPositions = prevPositionsRef.current;
            const prevDelays = prevDelaysRef.current;
            const arrivalTimestamps = arrivalTimestampsRef.current;
            const currentTrainNumbers = new Set<number>();
            const nowMs = Date.now();

            const enriched = newVehicles.vehicles.map((v) => {
                currentTrainNumbers.add(v.trainNumber);

                const lon = parseFloat(v.longitude);
                const lat = parseFloat(v.latitude);
                let heading = v.heading;
                if (!Number.isNaN(lon) && !Number.isNaN(lat)) {
                    const prev = prevPositions.get(v.trainNumber);
                    if (prev && (prev[0] !== lon || prev[1] !== lat)) {
                        heading = getCalculatedHeading(prev, [lon, lat]);
                    }
                    prevPositions.set(v.trainNumber, [lon, lat]);
                }

                let delayTrend: "up" | "down" | "flat" | undefined;
                const anchor = prevDelays.get(v.trainNumber);
                if (anchor === undefined) {
                    prevDelays.set(v.trainNumber, v.delay);
                } else {
                    const diff = v.delay - anchor;
                    if (Math.abs(diff) <= DELAY_TREND_THRESHOLD) {
                        delayTrend = "flat";
                    } else if (diff > 0) {
                        delayTrend = "up";
                        prevDelays.set(v.trainNumber, v.delay);
                    } else {
                        delayTrend = "down";
                        prevDelays.set(v.trainNumber, v.delay);
                    }
                }

                if (
                    v.status === VehicleStatus.AtStation ||
                    v.status === VehicleStatus.AtOrigin
                ) {
                    if (!arrivalTimestamps.has(v.trainNumber)) {
                        arrivalTimestamps.set(v.trainNumber, nowMs);
                    }
                } else if (arrivalTimestamps.has(v.trainNumber)) {
                    arrivalTimestamps.delete(v.trainNumber);
                }

                return { ...v, heading, delayTrend };
            });

            prevPositions.forEach((_, tn) => {
                if (!currentTrainNumbers.has(tn)) prevPositions.delete(tn);
            });
            prevDelays.forEach((_, tn) => {
                if (!currentTrainNumbers.has(tn)) prevDelays.delete(tn);
            });
            arrivalTimestamps.forEach((_, tn) => {
                if (!currentTrainNumbers.has(tn)) arrivalTimestamps.delete(tn);
            });

            if (typeof window !== "undefined") {
                const obj: Record<string, number> = {};
                arrivalTimestamps.forEach((v, k) => {
                    obj[String(k)] = v;
                });
                try {
                    window.sessionStorage.setItem(
                        ARRIVAL_KEY,
                        JSON.stringify(obj),
                    );
                } catch {
                    // sessionStorage may be full/disabled; non-fatal
                }
            }

            setVehicles(enriched);
        }
    }, [newVehicles]);

    useEffect(() => {
        if (vehicles && isLoading) {
            setIsLoading(false);
        }
        if (showPopup && selectedVehicle && vehicles) {
            const updatedSelectedVehicle =
                vehicles?.find(
                    (vehicle) =>
                        vehicle.trainNumber === selectedVehicle?.trainNumber,
                ) || null;

            setSelectedVehicle(updatedSelectedVehicle);
        }
    }, [vehicles]);

    // if (isLoading) return <div> </div>;

    // if (error) return <div>Error</div>;

    const stationsGeoJSON: GeoJSON = {
        type: "FeatureCollection",
        features:
            stations?.stations.map((station) => ({
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [
                        parseFloat(station.longitude),
                        parseFloat(station.latitude),
                    ],
                },
                properties: { ...station, type: "station" },
            })) || [],
    };

    // Dwell heatmap (F5.2): every station with history, drawn as a red stop
    // marker. Joins /api/heatmap/dwell aggregates onto the station coordinates
    // from /api/stations.
    const dwellByStation = new Map(
        dwellHeatmap?.stations.map((s) => [s.stationCode, s]) ?? [],
    );
    const dwellHeatmapGeoJSON: FeatureCollection<Point> = {
        type: "FeatureCollection",
        features: (stations?.stations ?? []).flatMap((station) => {
            const d = dwellByStation.get(station.code);
            if (!d || !station.latitude || !station.longitude) return [];
            return [
                {
                    type: "Feature" as const,
                    geometry: {
                        type: "Point" as const,
                        coordinates: [
                            parseFloat(station.longitude),
                            parseFloat(station.latitude),
                        ],
                    },
                    properties: {
                        designation: station.designation,
                        excessSeconds: d.avgExcessSeconds ?? 0,
                        dwellSeconds: d.avgDwellSeconds,
                        samples: d.samples,
                    },
                },
            ];
        }),
    };

    // Speed heatmap (F5.1): the whole rail network — every segment coloured by
    // average speed. segment_paths geometry follows the real OSM track.
    const speedHeatmapGeoJSON: FeatureCollection = speedHeatmap ?? {
        type: "FeatureCollection",
        features: [],
    };

    const vehiclesGeoJSON: GeoJSON = {
        type: "FeatureCollection",
        features: [],
    };

    vehicles?.forEach((vehicle) => {
        // generically do not show vehicles with invalid coordinates
        if (vehicle.latitude && vehicle.longitude) {
            vehiclesGeoJSON.features.push({
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [
                        parseFloat(vehicle.longitude),
                        parseFloat(vehicle.latitude),
                    ],
                },
                properties: { ...vehicle, type: "vehicle" },
            });
        }
    });

    function fetchAndSetSelectedStationNextArrivals() {
        if (selectedStation) {
            if (!selectedStationNextArrivalsRef.current)
                setIsLoadingArrivals(true);
            fetch("/api/stations/" + selectedStation.code + "/arrivals")
                .then((res) =>
                    res.ok
                        ? (res.json() as Promise<{
                              arrivals: TrainArrival[];
                          }>)
                        : { arrivals: [] as TrainArrival[] },
                )
                .then((data) => {
                    // const sortedArrivals = sortArrivals(data);
                    const parsedArrivals = data.arrivals
                        // only show realtime for now, no static schedule arrivals
                        .filter(
                            (a) =>
                                !a.supression &&
                                (a.ETA !== null ||
                                    a.ETD !== null ||
                                    a.delay !== null),
                        )
                        .map((arrival) => {
                            const arrivalTime = String(
                                arrival.ETA ?? arrival.ETD,
                            );
                            const parsedArrival = parseHHMM(arrivalTime);

                            if (!parsedArrival) {
                                return null;
                            }

                            return {
                                ...arrival,
                                durationToArrivalMinutes: Math.round(
                                    (parsedArrival.getTime() - Date.now()) /
                                        60000,
                                ),
                            };
                        })
                        .filter(
                            (
                                arrival,
                            ): arrival is TrainArrival & {
                                durationToArrivalMinutes: number;
                            } => arrival !== null,
                        );
                    setSelectedStationNextArrivals(parsedArrivals);
                    setIsLoadingArrivals(false);
                })
                .catch((err) => {
                    // Never let a failed arrivals fetch crash the app.
                    console.error("arrivals fetch failed", err);
                    setIsLoadingArrivals(false);
                });
        }
    }

    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        if (selectedStation && showStationPopup) {
            fetchAndSetSelectedStationNextArrivals();
            intervalId = setInterval(
                fetchAndSetSelectedStationNextArrivals,
                5000,
            );
        } else {
            setSelectedStationNextArrivals(null);
            setIsLoadingArrivals(false);
        }

        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [selectedStation, showStationPopup]);

    function onStationSelected(station: Station) {
        // Only one entity occupies the panel at a time — drop any selected train.
        setSelectedVehicle(null);
        setShowPopup(false);
        setSelectedStationNextArrivals(null);
        console.log("SETTING STATION:", station);
        setSelectedStation(station);
        setShowStationPopup(true);
        trackUmamiEvent("station_selected", {
            stationId: station.code,
            stationName: station.designation,
        });
    }

    function onVehicleSelected(vehicle: EnrichedVehicle) {
        // Only one entity occupies the panel at a time — drop any selected station.
        setSelectedStation(null);
        setShowStationPopup(false);
        setSelectedStationNextArrivals(null);
        console.log("SETTING VEHICLE:", vehicle);
        setSelectedVehicle(vehicle);
        console.log(selectedVehicle);
        console.log("Trying to select vehicle", vehicle);
        console.log("SelectedVehicle", selectedVehicle);
        setShowPopup(true);
        setActiveBottomSheetDetent(1);
        trackUmamiEvent("vehicle_selected", {
            trainNumber: vehicle.trainNumber,
            status: vehicle.status,
        });
    }

    const handleLayerClick = (event: MapLayerMouseEvent) => {
        console.log("MapClickEvent", event);
        if (event?.features?.[0]) {
            console.log(event?.features?.[0].properties.type);
            console.log(event?.features?.[0]);

            if (event?.features?.[0].properties.type === "vehicle") {
                const vehicle = event?.features?.[0]
                    .properties as EnrichedVehicle;
                // idk why but nested objects are stringified in the event properties??
                try {
                    if (vehicle.service) {
                        vehicle.service = JSON.parse(
                            vehicle.service as unknown as string,
                        ) as Service;
                    }
                    if (vehicle.origin) {
                        vehicle.origin = JSON.parse(
                            vehicle.origin as unknown as string,
                        ) as Service;
                    }
                    if (vehicle.destination) {
                        vehicle.destination = JSON.parse(
                            vehicle.destination as unknown as string,
                        ) as Service;
                    }
                    if (vehicle.gtfs) {
                        vehicle.gtfs = JSON.parse(
                            vehicle.gtfs as unknown as string,
                        ) as EnrichedVehicle["gtfs"];
                    }
                    // vehicle.trainStops = JSON.parse(
                    //     vehicle.trainStops as unknown as string
                    // ) as TrainStop[];
                    // if (vehicle.stop)
                    //     vehicle.stop = JSON.parse(
                    //         vehicle.stop as unknown as string
                    //     ) as TrainStop;
                    if (vehicle.units) {
                        vehicle.units = JSON.parse(
                            vehicle.units as unknown as string,
                        ) as string[];
                    }
                    onVehicleSelected(vehicle);
                } catch (e) {
                    console.log("Error parsing vehicle data", e);
                }
            }

            if (event?.features?.[0].properties.type === "station") {
                const station = event?.features?.[0].properties as Station;
                onStationSelected(station);
            }
        } else {
            console.log("no feature clicked");
            setShowPopup(false);
            setShowStationPopup(false);
            setSelectedVehicle(null);
            setSelectedStation(null);
            setSelectedStationNextArrivals(null);
        }
    };

    const handlePopupClose = () => {
        setShowPopup(false);

        // TODO: test this
        setSelectedVehicle(null);
        setActiveBottomSheetDetent(0);
    };

    const handleStationPopupClose = () => {
        setShowStationPopup(false);
        setSelectedStation(null);
        setSelectedStationNextArrivals(null);
    };

    // The single panel shows whichever entity is selected; closing clears both.
    const handleDetailPanelClose = () => {
        handlePopupClose();
        handleStationPopupClose();
    };

    const handleSearchVehicleSelect = (vehicle: EnrichedVehicle) => {
        onVehicleSelected(vehicle);
        map?.flyTo({
            center: [
                parseFloat(vehicle.longitude),
                parseFloat(vehicle.latitude),
            ],
            zoom: 15,
            essential: true, // this animation is considered essential with respect to prefers-reduced-motion
        });
        setShowSearchOverlay(false);
    };

    const handleSearchStationSelect = (station: Station) => {
        onStationSelected(station);
        // setSelectedVehicle(null);
        setActiveBottomSheetDetent(0);
        map?.flyTo({
            center: [
                parseFloat(station.longitude),
                parseFloat(station.latitude),
            ],
            zoom: 14,
            essential: true,
        });
        setShowSearchOverlay(false);
    };

    const vehiclesStatusLayerStyle: CircleLayer = {
        source: "vehicles",
        id: "vehicle",
        type: "circle",
        paint: {
            "circle-color": [
                "case",
                ["==", ["get", "status"], "CANCELLED"],
                "#D7263D", // strong red
                ["==", ["get", "status"], "COMPLETED"],
                "#808080", // gray
                "#388344", // default green
            ],
            "circle-radius": 5,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
        },
    };

    const vehiclesIconLayerStyle: SymbolLayer = {
        source: "vehicles",
        id: "vehicle-icon",
        type: "symbol",
        // Only render icons for active, moving trains (CANCELLED/COMPLETED stay as plain dots)
        filter: [
            "all",
            ["!=", ["get", "status"], "CANCELLED"],
            ["!=", ["get", "status"], "COMPLETED"],
            ["has", "heading"],
        ],
        layout: {
            "icon-image": "bus",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-anchor": "center",
            "icon-rotation-alignment": "map",
            "icon-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10,
                0.1,
                20,
                0.4,
            ],
            "icon-rotate": ["get", "heading"],
        },
    };

    // Direction-of-travel arrow: a small SDF arrow sitting just ahead of the
    // train dot, rotated to the heading derived from consecutive polls. Drawn
    // on top so the way the train is going is always readable.
    const vehiclesArrowLayerStyle: SymbolLayer = {
        source: "vehicles",
        id: "vehicle-arrow",
        type: "symbol",
        // Hidden when zoomed out — far away the dots and arrows blur together.
        minzoom: 6,
        filter: [
            "all",
            ["!=", ["get", "status"], "CANCELLED"],
            ["!=", ["get", "status"], "COMPLETED"],
            ["has", "heading"],
        ],
        layout: {
            "icon-image": "arrow",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-anchor": "center",
            "icon-rotation-alignment": "map",
            "icon-rotate": ["get", "heading"],
            "icon-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8,
                0.55,
                16,
                1.1,
            ],
            // Negative Y = ahead of the dot; the offset rotates with the icon.
            "icon-offset": [0, -26],
        },
        paint: {
            "icon-color": "#ffffff",
            "icon-halo-color": "#0b1a2a",
            "icon-halo-width": 1.6,
        },
    };

    const stationsLayerStyle: CircleLayer = {
        source: "stations",
        id: "station",
        type: "circle",
        minzoom: 7,
        paint: {
            // Small blue dot — distinct from the green trains.
            "circle-color": "#0B6CF2",
            "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                7,
                2,
                12,
                4,
            ],
            "circle-opacity": 0.95,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-opacity": 1,
        },
    };

    const stationsHitboxLayerStyle: CircleLayer = {
        source: "stations",
        id: "station-hitbox",
        type: "circle",
        minzoom: 7,
        paint: {
            // Almost invisible, but large enough to make small station markers easy to click.
            "circle-color": "#7fb3d5",
            "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                7,
                10,
                12,
                14,
            ],
            "circle-opacity": 0.01,
            "circle-stroke-width": 0,
        },
    };

    const selectedLineLayerStyle: LineLayer = {
        source: "line",
        id: "line",
        type: "line",
        paint: {
            "line-color": "#cb1a1a",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 20, 12],
            // "line-width": 4,
            "line-opacity": 0.8,
            // "line-pattern": "arrow",
        },
        layout: {
            "line-cap": "round",
            "line-join": "round",
        },
    };

    // Speed heatmap (F5.1): the selected train's track, coloured by average
    // speed — red (slow) → yellow → green (fast). Drawn thick so the route reads
    // clearly. A dark casing underneath keeps it visible over any basemap.
    const speedHeatmapCasingStyle: LineLayer = {
        source: "speed-route-heatmap",
        id: "speed-route-heatmap-casing",
        type: "line",
        paint: {
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 6, 14, 13],
            "line-color": "#0b1a2a",
            "line-opacity": 0.45,
        },
        layout: { "line-cap": "round", "line-join": "round" },
    };

    const speedHeatmapLayerStyle: LineLayer = {
        source: "speed-route-heatmap",
        id: "speed-route-heatmap",
        type: "line",
        paint: {
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 4, 14, 9],
            "line-opacity": 0.6,
            "line-color": [
                "interpolate",
                ["linear"],
                ["get", "avgSpeedKmh"],
                28,
                "#d7263d", // slow — red
                62,
                "#eab308", // medium — yellow
                100,
                "#22a447", // fast — green
            ],
        },
        layout: { "line-cap": "round", "line-join": "round" },
    };

    // Rail network outline (heatmap toggle OFF): the same network geometry,
    // drawn as a subtle green dashed line so the tracks stay visible on the
    // map without the speed colouring.
    const networkOutlineStyle: LineLayer = {
        source: "speed-route-heatmap",
        id: "network-outline",
        type: "line",
        paint: {
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 14, 4],
            "line-color": "#22a447",
            "line-opacity": 0.65,
            "line-dasharray": [2, 2],
        },
        layout: { "line-cap": "round", "line-join": "round" },
    };

    // Stops on the route — solid red markers ("altos"): this is where the train
    // halts. Excess-dwell data still rides on each feature for future use.
    const dwellHeatmapLayerStyle: CircleLayer = {
        source: "dwell-route-heatmap",
        id: "dwell-route-heatmap",
        type: "circle",
        paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 4, 12, 8],
            "circle-color": "#d7263d",
            "circle-opacity": 0.95,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#ffffff",
        },
    };

    function onFlyToTrain(trainNumber: number) {
        handlePopupClose();
        const vehicle = vehicles?.find((v) => v.trainNumber == trainNumber);
        if (vehicle) {
            map?.flyTo({
                center: [
                    parseFloat(vehicle.longitude),
                    parseFloat(vehicle.latitude),
                ],
                zoom: 16,
                essential: true,
            });

            onVehicleSelected(vehicle);
        }
    }

    const legendCardStyle: CSSProperties = {
        background: "rgba(255,255,255,0.95)",
        borderRadius: 8,
        padding: "8px 10px",
        boxShadow: "0 1px 6px rgba(0,0,0,0.3)",
        fontSize: "0.7rem",
        color: "#1a1a1a",
    };
    const legendTitleStyle: CSSProperties = {
        fontWeight: 700,
        marginBottom: 5,
    };
    const legendRowStyle: CSSProperties = {
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontVariantNumeric: "tabular-nums",
    };

    return (
        <>
            {/* <InfoDialog
                open={showInfoDialog}
                onClose={() => setShowInfoDialog(false)}
            /> */}
            {/* <BottomSheet
                selectedVehicle={selectedVehicle}
                activeDetent={activeBottomSheetDetent}
                onActiveDetentChange={setActiveBottomSheetDetent}
            /> */}
            <Toaster richColors />
            <SearchOverlay
                isOpen={showSearchOverlay}
                onClose={() => setShowSearchOverlay(false)}
                vehicles={vehicles || []}
                stations={stations?.stations || []}
                onVehicleSelect={handleSearchVehicleSelect}
                onStationSelect={handleSearchStationSelect}
            />
            {/* <GeneralStatisticsOverlay
                isOpen={showStatsOverlay}
                onClose={() => setShowStatsOverlay(false)}
                statistics={stats?.stats}
            /> */}
            {/* <CPLogo
                style={{
                    height: "5%",
                    width: "auto",
                    position: "absolute",
                    top: "20px",
                    left: 0,
                    right: 0,
                    margin: "auto",
                    zIndex: 4,
                    pointerEvents: "none",
                }}
            /> */}
            <div
                style={{
                    position: "absolute",
                    top: "22px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    margin: "auto",
                    zIndex: 4,
                    pointerEvents: "none",
                    fontSize: "2rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "1rem",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.55rem",
                    }}
                >
                    <img
                        src="/emojis/train.png"
                        alt="🚆"
                        style={{ height: "1em", verticalAlign: "middle" }}
                    />
                    <img
                        src="/emojis/portugal.png"
                        alt="🇵🇹"
                        style={{ height: "1em", verticalAlign: "middle" }}
                    />
                    <img
                        src="/emojis/map.png"
                        alt="🗺️"
                        style={{ height: "1em", verticalAlign: "middle" }}
                    />
                    <img
                        src="/emojis/compass.png"
                        alt="🧭"
                        style={{ height: "1em", verticalAlign: "middle" }}
                    />
                </div>
                {/* {(vehicles ?? []).filter(
                    (v) => v.status === VehicleStatus.Cancelled
                ).length > 0 && (
                    <Pill
                        color={BadgeColor.red}
                        text={`${
                            (vehicles ?? []).filter(
                                (v) => v.status === VehicleStatus.Cancelled
                            ).length
                        } suprimidos`}
                    />
                )} */}
            </div>
            {/* <TopBarButton
                style={{ position: "absolute", zIndex: 1 }}
                onClick={() => {
                    resolvedTheme == "light"
                        ? setTheme("dark")
                        : setTheme("light");
                }}
            > */}
            {/* If you use the manual theme button, there is currently no way to get back into system. */}
            {/* <Sun
                    className="absolute rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
                    size={26}
                />
                <Moon
                    className="rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
                    size={26}
                />
            </TopBarButton> */}
            {/* <TopBarButton
                style={{
                    position: "absolute",
                    zIndex: 1,
                    right: 0,
                }}
                onClick={() => {
                    setShowStopsOnMap(!showStopsOnMap);
                }}
            >
                <MapPinSimple size={26} />
            </TopBarButton> */}
            <div
                style={{
                    position: "absolute",
                    zIndex: 1,
                    left: 0,
                    top: 0,
                    display: "flex",
                    flexDirection: "row",
                    margin: "20px",
                    gap: "1rem",
                }}
            >
                <TopBarButton
                    onClick={() => {
                        window.open(
                            "https://github.com/joaodcp/cp-rt-ui",
                            "_blank",
                        );
                        trackUmamiEvent("github_link_clicked", {
                            source: "top_bar_button",
                        });
                    }}
                >
                    <GithubLogo size={26} />
                </TopBarButton>
                <TopBarButton
                    onClick={() => {
                        i18n.changeLanguage(
                            i18n.language === "en" ? "pt" : "en",
                        );
                        trackUmamiEvent("language_changed", {
                            source: "top_bar_button",
                            newLanguage: i18n.language === "en" ? "pt" : "en",
                        });
                    }}
                    style={{ position: "relative" }} // make the button a relative container
                >
                    <Globe size={26} />
                    <span
                        style={{
                            position: "absolute",
                            bottom: 2,
                            right: 4,
                            fontSize: 8,
                            fontWeight: "bold",
                            color: "white",
                            textShadow: "0 0 2px rgba(0,0,0,0.7)",
                            pointerEvents: "none",
                        }}
                    >
                        {i18n.language.toUpperCase()}
                    </span>
                </TopBarButton>
                <TopBarButton
                    title={t("heatmap.toggle")}
                    onClick={() => {
                        setShowRouteHeatmap((v) => !v);
                        trackUmamiEvent("heatmap_toggled", {
                            layer: "network",
                        });
                    }}
                    style={
                        showRouteHeatmap
                            ? { background: "#0b6cf2", color: "#fff" }
                            : undefined
                    }
                >
                    <Gauge size={26} />
                </TopBarButton>
            </div>
            <TopBarButton
                style={{
                    position: "absolute",
                    zIndex: 1,
                    right: 0,
                    margin: "20px",
                }}
                onClick={() => {
                    setShowSearchOverlay(!showSearchOverlay);
                    trackUmamiEvent("search_overlay_opened", {
                        source: "top_bar_button",
                    });
                }}
            >
                <MagnifyingGlass size={26} />
            </TopBarButton>
            <div className="loader-container">
                <FadeInOut fade={isLoading ? Fade.none : Fade.out}>
                    <Centered style={{ background: "#000" }}>
                        <Loader />
                    </Centered>
                </FadeInOut>
            </div>
            {heatmapActive && (
                <div
                    style={{
                        position: "absolute",
                        zIndex: 1,
                        left: 0,
                        bottom: 0,
                        margin: "20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                    }}
                >
                    <div style={legendCardStyle}>
                        <div style={legendTitleStyle}>
                            {t("heatmap.speed_legend")}
                        </div>
                        {(
                            [
                                ["#22a447", "speed_fast"],
                                ["#eab308", "speed_medium"],
                                ["#d7263d", "speed_slow"],
                            ] as const
                        ).map(([color, key], i) => (
                            <div
                                key={key}
                                style={{
                                    ...legendRowStyle,
                                    marginTop: i === 0 ? 0 : 4,
                                }}
                            >
                                <div
                                    style={{
                                        width: 14,
                                        height: 8,
                                        borderRadius: 2,
                                        background: color,
                                        flexShrink: 0,
                                    }}
                                />
                                <span>{t(`heatmap.${key}`)}</span>
                            </div>
                        ))}
                        <div
                            style={{
                                ...legendRowStyle,
                                marginTop: 6,
                            }}
                        >
                            <div
                                style={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: 12,
                                    background: "#d7263d",
                                    border: "1.5px solid #fff",
                                    flexShrink: 0,
                                }}
                            />
                            <span>{t("heatmap.stop")}</span>
                        </div>
                    </div>
                </div>
            )}
            <WGLMap
                id="map"
                initialViewState={{
                    latitude: 39.514525450960036,
                    longitude: -7.969213273122932,
                    zoom: 6.4444226078908144,
                }}
                interactiveLayerIds={["vehicle", "station", "station-hitbox"]}
                onClick={handleLayerClick}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onLoad={(evt) => {
                    // Recolour the railway lines green — but only if the active
                    // basemap style actually exposes those layers. Different
                    // styles name layers differently; guarding avoids a throw
                    // that would leave the map blank.
                    const map = evt.target;
                    if (map.getLayer("railway")) {
                        map.setPaintProperty(
                            "railway",
                            "line-color",
                            "#1c4122",
                        );
                        map.setLayerZoomRange("railway", 4, 22);
                    }
                    if (map.getLayer("railway_minor")) {
                        map.setPaintProperty(
                            "railway_minor",
                            "line-color",
                            "#112714",
                        );
                        map.setLayerZoomRange("railway_minor", 15, 22);
                    }
                }}
                cursor={cursor}
            >
                {/* Rendered first so the rail geometry sits BELOW the
                    stations and vehicles. Heatmap ON → speed colouring;
                    heatmap OFF → subtle green dashed track outline. */}
                {speedHeatmap && (
                    <Source
                        id="speed-route-heatmap"
                        type="geojson"
                        data={speedHeatmapGeoJSON}
                    >
                        {heatmapActive ? (
                            <>
                                <Layer
                                    {...speedHeatmapCasingStyle}
                                ></Layer>
                                <Layer
                                    {...speedHeatmapLayerStyle}
                                ></Layer>
                            </>
                        ) : (
                            <Layer {...networkOutlineStyle}></Layer>
                        )}
                    </Source>
                )}
                <Source id="stations" type="geojson" data={stationsGeoJSON}>
                    <Layer {...stationsHitboxLayerStyle}></Layer>
                    <Layer {...stationsLayerStyle}></Layer>
                </Source>
                {heatmapActive && (
                    <Source
                        id="dwell-route-heatmap"
                        type="geojson"
                        data={dwellHeatmapGeoJSON}
                    >
                        <Layer {...dwellHeatmapLayerStyle}></Layer>
                    </Source>
                )}
                <Source
                    id="vehicles"
                    type="geojson"
                    data={vehiclesGeoJSON}
                    attribution="Informação em tempo real proveniente de CP – Comboios de Portugal, E. P. E."
                >
                    <Layer {...vehiclesStatusLayerStyle}></Layer>
                    <Layer {...vehiclesIconLayerStyle}></Layer>
                    <Layer {...vehiclesArrowLayerStyle}></Layer>
                </Source>

            </WGLMap>
            <DetailPanel
                open={!!(selectedVehicle || selectedStation)}
                title={
                    selectedVehicle
                        ? t("vehicle_popup.train", {
                              trainNumber: selectedVehicle.trainNumber,
                          })
                        : selectedStation?.designation ?? ""
                }
                selectionKey={
                    selectedVehicle
                        ? `v${selectedVehicle.trainNumber}`
                        : selectedStation
                          ? `s${selectedStation.code}`
                          : null
                }
                onClose={handleDetailPanelClose}
            >
                {selectedVehicle ? (
                    <VehicleDetailContent
                        vehicle={selectedVehicle}
                        trip={selectedTrip}
                        physicsEta={physicsEtaSelected}
                        arrivedAt={arrivedAtSelected}
                        stations={stations?.stations}
                    />
                ) : selectedStation ? (
                    <StationDetailContent
                        station={selectedStation}
                        arrivals={selectedStationNextArrivals}
                        isLoadingArrivals={isLoadingArrivals}
                        vehicles={vehicles}
                        onFlyToTrain={onFlyToTrain}
                    />
                ) : null}
            </DetailPanel>
        </>
    );
}

export default dynamic(() => Promise.resolve(Home), {
    ssr: false,
});
