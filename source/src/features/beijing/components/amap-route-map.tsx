"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { Map } from "lucide-react";
import type { AmapCoordinate, AmapTripPlan } from "@/features/beijing/lib/amap-types";

type AMapLike = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => { destroy: () => void; setFitView: (overlays?: unknown[]) => void };
  Marker: new (options: Record<string, unknown>) => unknown;
  Polyline: new (options: Record<string, unknown>) => unknown;
};

declare global {
  interface Window {
    AMap?: AMapLike;
    _AMapSecurityConfig?: { serviceHost: string };
  }
}

const path = (points: AmapCoordinate[]) => points.map((point) => [point.lng, point.lat]);

export function AmapRouteMap({ plan, configured }: { plan: AmapTripPlan | null; configured: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ destroy: () => void } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const jsKey = process.env.NEXT_PUBLIC_AMAP_JS_KEY;

  useEffect(() => {
    if (!loaded || !plan || !containerRef.current || !window.AMap) return;
    mapRef.current?.destroy();
    const AMap = window.AMap;
    const map = new AMap.Map(containerRef.current, { zoom: 10, viewMode: "2D", mapStyle: "amap://styles/whitesmoke" });
    mapRef.current = map;
    const overlays: unknown[] = [];
    const addMarker = (position: AmapCoordinate, title: string, color: string) => {
      const marker = new AMap.Marker({
        position: [position.lng, position.lat],
        title,
        label: { content: `<span class="amap-label-dot" style="border-color:${color}">${title}</span>`, direction: "top" },
      });
      overlays.push(marker);
    };

    plan.participants.forEach((participant, index) => {
      addMarker(participant.origin, `${participant.name} 出发`, index === 0 ? "#718a77" : "#8a7ba5");
      const points = participant.toMeeting?.polyline.length ? participant.toMeeting.polyline : [participant.origin, plan.meetingPoint];
      overlays.push(new AMap.Polyline({ path: path(points), strokeColor: index === 0 ? "#718a77" : "#8a7ba5", strokeWeight: 5, strokeOpacity: 0.82, showDir: true }));
    });
    addMarker(plan.meetingPoint, `汇合：${plan.meetingPoint.name}`, "#d99a69");
    addMarker(plan.destination, `目的地：${plan.destination.name}`, "#4f6b58");
    const commonPoints = plan.meetingToDestination?.polyline.length ? plan.meetingToDestination.polyline : [plan.meetingPoint, plan.destination];
    overlays.push(new AMap.Polyline({ path: path(commonPoints), strokeColor: "#d99a69", strokeWeight: 6, strokeOpacity: 0.9, showDir: true }));
    map.setFitView(overlays);
    return () => {
      map.destroy();
      mapRef.current = null;
    };
  }, [loaded, plan]);

  if (!configured || !jsKey) {
    return <div className="map-placeholder"><Map size={42} /><strong>地图尚未配置完成</strong><span>需要高德 JS Key、Web 服务 Key 与安全密钥三项同时可用。</span></div>;
  }

  return (
    <>
      <Script id="amap-security-config" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `window._AMapSecurityConfig={serviceHost:window.location.origin+"/_AMapService"};` }} />
      <Script id="amap-js-api" src={`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(jsKey)}`} strategy="afterInteractive" onReady={() => setLoaded(true)} />
      <div className="amap-map" ref={containerRef} aria-label="高德路线地图">
        {!plan ? <div className="map-loading"><Map size={34} /><span>路线生成后在这里显示实际地图</span></div> : null}
      </div>
    </>
  );
}
