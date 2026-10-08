import "server-only";

const amapKey = () => {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key) throw new Error("AMAP_NOT_CONFIGURED");
  return key;
};

export async function geocodeBeijingAddress(address: string) {
  const params = new URLSearchParams({ key: amapKey(), address, city: "北京" });
  const response = await fetch(`https://restapi.amap.com/v3/geocode/geo?${params}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("AMAP_UPSTREAM_ERROR");
  return response.json();
}

export async function getAmapDirections(origin: string, destination: string, mode: "transit" | "driving" | "walking" | "bicycling") {
  const common = { key: amapKey(), origin, destination };
  const config = mode === "transit"
    ? { endpoint: "https://restapi.amap.com/v5/direction/transit/integrated", params: { ...common, city1: "010", city2: "010" } }
    : mode === "driving"
      ? { endpoint: "https://restapi.amap.com/v5/direction/driving", params: common }
      : mode === "walking"
        ? { endpoint: "https://restapi.amap.com/v3/direction/walking", params: common }
        : { endpoint: "https://restapi.amap.com/v4/direction/bicycling", params: common };
  const response = await fetch(`${config.endpoint}?${new URLSearchParams(config.params)}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("AMAP_UPSTREAM_ERROR");
  return response.json();
}
