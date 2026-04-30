import i18n from "@/i18n/i18n";

export function formatDuration(seconds: number, verbose = false): string {
    const t = i18n.t.bind(i18n);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (!verbose) {
        let str = "";
        if (h > 0) str += `${h}h`;
        if (m > 0) str += `${m}m`;
        if (s > 0 || str === "") str += `${s}s`;
        return str;
    }

    const parts = [];
    if (h > 0) parts.push(`${h} ${h === 1 ? t("time.hour") : t("time.hours")}`);
    if (m > 0)
        parts.push(`${m} ${m === 1 ? t("time.minute") : t("time.minutes")}`);
    if (s > 0 || parts.length === 0)
        parts.push(`${s} ${s === 1 ? t("time.second") : t("time.seconds")}`);

    if (parts.length === 1) return parts[0];
    return (
        parts.slice(0, -1).join(", ") +
        " " +
        t("time.and") +
        " " +
        parts.slice(-1)
    );
}

export function parseHHMM(
    timeStr: string,
    operationalDate: Date = new Date(),
): Date | null {
    const [hours, minutes] = timeStr.split(":").map(Number);

    if (
        isNaN(hours) ||
        isNaN(minutes) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
    ) {
        return null;
    }

    const date = new Date(operationalDate);
    date.setHours(hours, minutes, 0, 0);
    return date;
}

export function scheduledDwellSeconds(
    arrivalHHMM: string | null,
    departureHHMM: string | null,
): number | null {
    if (!arrivalHHMM || !departureHHMM) return null;
    const arr = arrivalHHMM.match(/^(\d{1,2}):(\d{2})$/);
    const dep = departureHHMM.match(/^(\d{1,2}):(\d{2})$/);
    if (!arr || !dep) return null;
    const arrMin = parseInt(arr[1], 10) * 60 + parseInt(arr[2], 10);
    const depMin = parseInt(dep[1], 10) * 60 + parseInt(dep[2], 10);
    let diff = (depMin - arrMin) * 60;
    if (diff < 0) diff += 24 * 3600; // wraparound past midnight
    return diff;
}
