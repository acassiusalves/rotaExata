"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalJson = canonicalJson;
exports.factsHash = factsHash;
exports.firestoreRevision = firestoreRevision;
exports.timestampIso = timestampIso;
exports.sourceStopKey = sourceStopKey;
exports.plannedFingerprint = plannedFingerprint;
exports.protectCompletion = protectCompletion;
exports.routeFacts = routeFacts;
exports.sourceSnapshot = sourceSnapshot;
exports.makeEnvelope = makeEnvelope;
exports.deletionRevision = deletionRevision;
const node_crypto_1 = require("node:crypto");
const evidenceValues = new Set(["driver-server-v1", "auto-server-v1", "admin-server-v1"]);
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function string(value, max = 150) {
    return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;
}
function number(value, min, max) {
    return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}
function canonicalJson(value) {
    if (Array.isArray(value))
        return "[" + value.map(canonicalJson).join(",") + "]";
    if (value && typeof value === "object") {
        const object = value;
        return "{" + Object.keys(object).sort().filter((key) => object[key] !== undefined)
            .map((key) => JSON.stringify(key) + ":" + canonicalJson(object[key])).join(",") + "}";
    }
    return JSON.stringify(value) ?? "null";
}
function factsHash(value) {
    return (0, node_crypto_1.createHash)("sha256").update(canonicalJson(value)).digest("hex");
}
function firestoreRevision(value) {
    if (!Number.isSafeInteger(value.seconds) || value.seconds < 0 || value.seconds > 999999999999 ||
        !Number.isInteger(value.nanoseconds) || value.nanoseconds < 0 || value.nanoseconds >= 1e9) {
        throw new Error("Invalid source revision");
    }
    return String(value.seconds).padStart(12, "0") + "." + String(value.nanoseconds).padStart(9, "0");
}
function timestampIso(value) {
    const input = record(value);
    const seconds = input.seconds ?? input._seconds;
    const nanoseconds = input.nanoseconds ?? input._nanoseconds;
    let parsed = null;
    if (value instanceof Date)
        parsed = value;
    else if (typeof value === "string" && /T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value))
        parsed = new Date(value);
    else if (typeof seconds === "number" && typeof nanoseconds === "number") {
        parsed = new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6));
    }
    return parsed && Number.isFinite(parsed.valueOf()) ? parsed.toISOString() : null;
}
function sourceStopKey(stop) {
    const id = string(stop.id, 135);
    const point = string(stop.pointCode, 135);
    const place = string(stop.placeId, 135);
    return id ? "id:" + id : point ? "point:" + point : place ? "place:" + place : null;
}
function projectedStop(value) {
    const stop = record(value);
    const deliveryStatus = stop.deliveryStatus;
    const status = deliveryStatus === "completed" || deliveryStatus === "failed" ? deliveryStatus : "open";
    const exception = stop.previousRouteId ? "moved" :
        stop.isRedelivery ? "redelivery" : stop.operationType === "troca" || stop.operationType === "misto" || stop.hasExchangeItems ? "exchange" :
            stop.operationType === "retorno" ? "return" : null;
    return {
        id: sourceStopKey(stop), status,
        visited: status === "failed" && typeof stop.wentToLocation === "boolean" ? stop.wentToLocation : null,
        city: string(stop.cidade ?? stop.city, 120), state: string(stop.uf ?? stop.state, 30),
        lat: number(stop.lat, -90, 90), lng: number(stop.lng, -180, 180),
        category: string(stop.locationCategory, 80),
        lunna: typeof stop.isLunnaOrder === "boolean" ? stop.isLunnaOrder : stop.lunnaClientCode || Array.isArray(stop.items) ? true : null,
        exception,
        completedAt: status === "open" ? null : timestampIso(stop.completedAt),
    };
}
const localDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});
function baseFacts(data) {
    const origin = record(data.origin);
    const originLat = number(origin.lat, -90, 90);
    const originLng = number(origin.lng, -180, 180);
    const plannedInstant = timestampIso(data.plannedDate);
    return {
        driverUid: string(data.driverId, 128),
        status: string(data.status, 40),
        workedAt: timestampIso(data.completedAt),
        plannedAt: plannedInstant ? localDay.format(new Date(plannedInstant)) :
            typeof data.plannedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.plannedDate) ? data.plannedDate : null,
        forced: Boolean(data.forceCompletedBy),
        origin: originLat !== null && originLng !== null ? { lat: originLat, lng: originLng } : null,
        distanceMeters: number(data.distanceMeters, 0, 10000000),
        stops: (Array.isArray(data.stops) ? data.stops : []).slice(0, 1001).map(projectedStop),
    };
}
function plannedFingerprint(data) {
    const { driverUid, distanceMeters, origin, plannedAt, stops } = baseFacts(data);
    const planStops = stops.map(({ status: _status, visited: _visited, completedAt: _time, ...plan }) => plan);
    return factsHash({ driverUid, distanceMeters, origin, plannedAt, planStops });
}
function protectCompletion(data, evidence) {
    const facts = baseFacts(data);
    const start = record(data.earningsSourceStart);
    if (!facts.workedAt || !facts.driverUid || facts.forced || facts.driverUid !== start.driverUid ||
        !facts.stops.length || facts.stops.length > 1000 || start.plan !== plannedFingerprint(data))
        return undefined;
    const ids = facts.stops.map((stop) => stop.id);
    if (ids.includes(null) || new Set(ids).size !== ids.length)
        return undefined;
    const confirmed = record(start.confirmations);
    for (const stop of facts.stops) {
        const confirmation = record(confirmed[stop.id]);
        if (stop.status === "open") {
            if (evidence === "auto-server-v1" || Object.keys(confirmation).length > 0)
                return undefined;
        }
        else if (!stop.completedAt || stop.status !== confirmation.status ||
            stop.visited !== confirmation.visited || stop.completedAt !== confirmation.workedAt)
            return undefined;
    }
    return { kind: evidence, digest: factsHash(facts) };
}
function routeFacts(data) {
    const facts = baseFacts(data);
    const completion = record(data.earningsSourceCompletion);
    const evidence = typeof completion.kind === "string" && evidenceValues.has(completion.kind) && completion.digest === factsHash(facts)
        ? completion.kind : null;
    return { ...facts, evidence };
}
function sourceSnapshot(data, proof = {}) {
    const candidate = { ...data, earningsSourceCompletion: proof.completion };
    if (routeFacts(candidate).evidence || !["completed", "completed_auto"].includes(String(data.status)))
        return candidate;
    // A privileged operational closer may mark the route done without marking the
    // work time. A full set of independently confirmed stops can prove that time.
    const stops = baseFacts(data).stops;
    if (!stops.length || stops.some((stop) => stop.status === "open" || !stop.completedAt))
        return candidate;
    const workedAt = stops.map((stop) => stop.completedAt).sort().at(-1);
    const fromStops = { ...candidate, completedAt: workedAt, earningsSourceStart: proof.start };
    const completion = protectCompletion(fromStops, data.status === "completed_auto" ? "auto-server-v1" : "admin-server-v1");
    return completion ? { ...fromStops, earningsSourceCompletion: completion } : candidate;
}
function makeEnvelope(sourceProject, logicalRouteId, revision, eventType, data) {
    const sourceRevision = firestoreRevision(revision);
    const facts = routeFacts(data);
    const sourceTime = timestampIso(revision);
    if (!sourceTime)
        throw new Error("Invalid source time");
    return {
        sourceProject, logicalRouteId, eventId: factsHash([sourceProject, logicalRouteId, sourceRevision, eventType]),
        sourceRevision, eventType, sourceTime, schemaVersion: 1, factsFingerprint: factsHash(facts), facts,
    };
}
function deletionRevision(eventTime, lastUpdate) {
    const date = new Date(eventTime);
    if (!Number.isFinite(date.valueOf()))
        throw new Error("Invalid delete event time");
    const seconds = Math.floor(date.valueOf() / 1000);
    const fractional = eventTime.match(/\.([0-9]{1,9})Z$/)?.[1] ?? "";
    const candidate = { seconds, nanoseconds: Number(fractional.padEnd(9, "0")) };
    if (firestoreRevision(candidate) > firestoreRevision(lastUpdate))
        return candidate;
    return lastUpdate.nanoseconds === 999999999
        ? { seconds: lastUpdate.seconds + 1, nanoseconds: 0 }
        : { seconds: lastUpdate.seconds, nanoseconds: lastUpdate.nanoseconds + 1 };
}
//# sourceMappingURL=earnings-source-adapter.js.map