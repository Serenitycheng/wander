import "server-only";

import type { AmapCoordinate, AmapPlace, AmapWeather, TravelEstimate, TravelMode } from "@/lib/amap-types";

const amapKey = () => {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key) throw new Error("AMAP_NOT_CONFIGURED");
  return key;
};

const fetchAmap = async (endpoint: string, input: Record<string, string>) => {
  const params = new URLSearchParams({ key: amapKey(), ...input });
  const response = await fetch(`${endpoint}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("AMAP_UPSTREAM_ERROR");
  const payload = await response.json() as Record<string, unknown>;
  if (payload.status === "0" || payload.errcode) throw new Error("AMAP_UPSTREAM_ERROR");
  return payload;
};

const coordinate = (value: unknown): AmapCoordinate | null => {
  if (typeof value !== "string") return null;
  const [lng, lat] = value.split(",").map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const asRecords = (value: unknown) => Array.isArray(value)
  ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
  : [];

const asString = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";

export async function geocodeBeijingAddress(address: string) {
  return fetchAmap("https://restapi.amap.com/v3/geocode/geo", { address, city: "北京" });
}

export async function resolveBeijingAddress(address: string): Promise<AmapPlace> {
  const payload = await geocodeBeijingAddress(address);
  const result = asRecords(payload.geocodes)[0];
  const location = coordinate(result?.location);
  if (!result || !location) throw new Error("AMAP_ADDRESS_NOT_FOUND");
  return { ...location, name: address, address: asString(result.formatted_address) || address, adcode: asString(result.adcode), matchedBy: "address" };
}

export async function resolveBeijingPlace(query: string): Promise<AmapPlace> {
  const payload = await fetchAmap("https://restapi.amap.com/v5/place/text", {
    keywords: query,
    region: "北京",
    city_limit: "true",
    page_size: "5",
    show_fields: "business",
  });
  const result = asRecords(payload.pois)[0];
  const location = coordinate(result?.location);
  if (!result || !location) return resolveBeijingAddress(query);
  return {
    ...location,
    name: asString(result.name) || query,
    address: asString(result.address) || "北京市",
    adcode: asString(result.adcode),
    matchedBy: "poi",
  };
}

export async function searchBeijingPlaces(query: string, pageSize = 5): Promise<AmapPlace[]> {
  const payload = await fetchAmap("https://restapi.amap.com/v5/place/text", {
    keywords: query,
    region: "北京",
    city_limit: "true",
    page_size: String(Math.min(10, Math.max(1, pageSize))),
    show_fields: "business",
  });
  return asRecords(payload.pois).flatMap((item) => {
    const location = coordinate(item.location);
    if (!location) return [];
    return [{
      ...location,
      name: asString(item.name) || query,
      address: asString(item.address) || "北京市",
      adcode: asString(item.adcode),
      matchedBy: "poi" as const,
    }];
  });
}

export async function findMeetingPoint(points: AmapCoordinate[]): Promise<AmapPlace> {
  const average = points.reduce((result, point) => ({ lng: result.lng + point.lng, lat: result.lat + point.lat }), { lng: 0, lat: 0 });
  const center = { lng: average.lng / points.length, lat: average.lat / points.length };
  const payload = await fetchAmap("https://restapi.amap.com/v5/place/around", {
    keywords: "地铁站",
    location: `${center.lng},${center.lat}`,
    radius: "5000",
    page_size: "10",
    sortrule: "distance",
  });
  const result = asRecords(payload.pois)[0];
  const location = coordinate(result?.location);
  if (!result || !location) return { ...center, name: "系统平衡点", address: "附近未匹配到地铁站，请在地图中确认", matchedBy: "system" };
  return {
    ...location,
    name: asString(result.name) || "建议汇合地铁站",
    address: asString(result.address) || "北京市",
    adcode: asString(result.adcode),
    matchedBy: "system",
  };
}

export async function getAmapDirections(origin: string, destination: string, mode: TravelMode) {
  const common = { origin, destination };
  const config = mode === "transit"
    ? { endpoint: "https://restapi.amap.com/v5/direction/transit/integrated", params: { ...common, city1: "010", city2: "010", show_fields: "cost" } }
    : mode === "driving"
      ? { endpoint: "https://restapi.amap.com/v5/direction/driving", params: { ...common, show_fields: "cost" } }
      : mode === "walking"
        ? { endpoint: "https://restapi.amap.com/v3/direction/walking", params: common }
        : { endpoint: "https://restapi.amap.com/v4/direction/bicycling", params: common };
  return fetchAmap(config.endpoint, config.params);
}

const collectPolyline = (value: unknown, result: AmapCoordinate[]) => {
  if (typeof value === "string" && value.includes(",")) {
    value.split(";").forEach((item) => {
      const point = coordinate(item);
      if (point) result.push(point);
    });
    return;
  }
  if (Array.isArray(value)) value.forEach((item) => collectPolyline(item, result));
  else if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (["polyline", "steps", "segments", "walking", "bus", "buslines", "railway"].includes(key)) collectPolyline(item, result);
    });
  }
};

const collectRailNames = (value: unknown, result: string[]) => {
  if (Array.isArray(value)) return value.forEach((item) => collectRailNames(item, result));
  if (!value || typeof value !== "object") return;
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (key === "name" && typeof item === "string" && /(市郊铁路|S2线|怀密线|通密线|副中心线)/i.test(item)) result.push(item);
    else collectRailNames(item, result);
  });
};

export const normalizeDirections = (payload: Record<string, unknown>, mode: TravelMode): TravelEstimate => {
  const route = asRecord(payload.route);
  const data = asRecord(payload.data);
  const candidate = mode === "transit" ? asRecords(route?.transits)[0] : mode === "bicycling" ? asRecords(data?.paths)[0] : asRecords(route?.paths)[0];
  const cost = asRecord(candidate?.cost);
  const durationSeconds = Number(candidate?.duration ?? cost?.duration ?? 0);
  const distanceMeters = Number(candidate?.distance ?? route?.distance ?? 0);
  const polylines: AmapCoordinate[] = [];
  const railNames: string[] = [];
  collectPolyline(candidate, polylines);
  collectRailNames(candidate, railNames);
  const durationMinutes = durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : null;
  const distanceKm = distanceMeters > 0 ? Math.round(distanceMeters / 100) / 10 : null;
  return {
    mode,
    available: Boolean(candidate && (durationMinutes || distanceKm)),
    durationMinutes,
    distanceKm,
    summary: durationMinutes ? `${durationMinutes} 分钟${distanceKm ? ` · ${distanceKm} 公里` : ""}` : "暂无可用路线",
    suburbanRail: [...new Set(railNames)].slice(0, 4),
    polyline: polylines.filter((_, index) => index % Math.max(1, Math.ceil(polylines.length / 700)) === 0).slice(0, 700),
  };
};

export async function estimateRoute(origin: AmapCoordinate, destination: AmapCoordinate, mode: TravelMode) {
  const payload = await getAmapDirections(`${origin.lng},${origin.lat}`, `${destination.lng},${destination.lat}`, mode);
  return normalizeDirections(payload, mode);
}

export async function getBeijingWeather(): Promise<AmapWeather> {
  const payload = await fetchAmap("https://restapi.amap.com/v3/weather/weatherInfo", { city: "110000", extensions: "all" });
  const forecast = asRecords(payload.forecasts)[0];
  if (!forecast) throw new Error("AMAP_WEATHER_NOT_FOUND");
  return {
    city: asString(forecast.city) || "北京",
    reportTime: asString(forecast.reporttime),
    days: asRecords(forecast.casts).slice(0, 4).map((day) => ({
      date: asString(day.date), dayWeather: asString(day.dayweather), nightWeather: asString(day.nightweather),
      dayTemp: asString(day.daytemp), nightTemp: asString(day.nighttemp), dayWind: asString(day.daywind),
    })),
  };
}
