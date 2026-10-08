"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Bike,
  Car,
  Check,
  CircleDot,
  LoaderCircle,
  MapPin,
  Navigation,
  RefreshCw,
  TrainFront,
  UsersRound,
} from "lucide-react";
import { AmapRouteMap } from "@/components/amap-route-map";
import type { AmapTripPlan, TravelEstimate } from "@/lib/amap-types";
import type { Recommendation, TripDraft } from "@/lib/types";

type RouteViewProps = {
  draft: TripDraft;
  selection: Recommendation;
  amapConfigured: boolean;
  onBack: () => void;
  onDone: () => void;
};

const estimateText = (estimate: TravelEstimate | undefined) => estimate?.available ? estimate.summary : "暂无结果";

export function RouteView({ draft, selection, amapConfigured, onBack, onDone }: RouteViewProps) {
  const { activity } = selection;
  const users = useMemo(() => draft.participantIds.map((id) => ({ id, name: id === "serenity" ? "Serenity" : "zzz", address: draft.answers[id].address })), [draft.answers, draft.participantIds]);
  const [plan, setPlan] = useState<AmapTripPlan | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");

  const generatePlan = useCallback(async () => {
    if (!amapConfigured) {
      setStatus("error");
      setMessage("高德 API 尚未完整配置，暂时只能查看方案结构。");
      return;
    }
    if (users.some((user) => !user.address.trim())) {
      setStatus("error");
      setMessage("请返回问题页，为每个人补充具体出发地址后再生成路线。");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/amap/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationQuery: `${activity.venue} ${activity.area} ${activity.name}`,
          destinationLabel: activity.venue,
          origins: users,
        }),
      });
      const payload = await response.json() as AmapTripPlan & { error?: string };
      if (!response.ok) throw new Error(payload.error || "路线暂时无法生成。");
      setPlan(payload);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "路线暂时无法生成。");
    }
  }, [activity.area, activity.name, activity.venue, amapConfigured, users]);

  useEffect(() => {
    const timer = window.setTimeout(() => void generatePlan(), 0);
    return () => window.clearTimeout(timer);
  }, [generatePlan]);

  return (
    <section className="route-view">
      <div className="route-heading">
        <div><button className="icon-text-button" type="button" onClick={onBack}><ArrowLeft size={17} /> 返回三个候选</button><span className="section-kicker">完整执行方案 · 不生成详细时刻表</span><h2>{activity.name}</h2><p>{activity.venue} · {activity.area}</p></div>
        <span className="selection-score">{selection.score}<small>综合匹配</small></span>
      </div>

      <div className="route-stack">
        <section className="route-card map-card">
          <div className="panel-heading">
            <div><span className="section-kicker">高德地图</span><h3>{status === "ready" ? "实际地点与路线" : "正在准备地点与路线"}</h3></div>
            <span className={`soft-badge ${status === "error" ? "warning" : ""}`}>{status === "loading" ? "正在测算" : status === "ready" ? "已生成" : status === "error" ? "需要处理" : "等待"}</span>
          </div>
          <AmapRouteMap plan={plan} configured={amapConfigured} />
          {status === "loading" ? <div className="route-status"><span className="spin"><LoaderCircle size={17} /></span> 正在定位地址、寻找汇合点并比较交通方式…</div> : null}
          {status === "error" ? <div className="route-status error"><AlertCircle size={17} /><span>{message}</span><button type="button" onClick={() => void generatePlan()}><RefreshCw size={14} /> 重试</button></div> : null}
          {plan?.destinationNeedsConfirmation ? <div className="truth-banner compact"><AlertCircle size={17} /><span>{plan.warnings[0]}</span></div> : null}
        </section>

        <section className="route-card">
          <div className="panel-heading"><div><span className="section-kicker">地点顺序</span><h3>每个人出发 → 汇合 → 活动 → 各自返程</h3></div><Navigation size={20} /></div>
          <div className="route-timeline">
            {users.map((user) => {
              const route = plan?.participants.find((participant) => participant.id === user.id);
              return <div className="timeline-item origin" key={user.id}><span className="timeline-icon"><MapPin size={16} /></span><div><small>{user.name} 出发</small><strong>{route?.origin.address || user.address || "尚未填写具体地址"}</strong><span>{route?.toMeeting?.available ? `到汇合点：${route.toMeeting.summary}` : "等待高德测算到汇合点路线"}</span></div></div>;
            })}
            <div className="timeline-join"><UsersRound size={18} /><span><strong>系统汇合点：{plan?.meetingPoint.name || "待计算"}</strong><small>{plan ? `${plan.meetingPoint.address} · 综合所有人出发地与目的地后匹配附近地铁站` : "将综合所有人的位置和共同目的地。"}</small></span></div>
            <div className="timeline-item destination"><span className="timeline-icon"><CircleDot size={17} /></span><div><small>共同活动</small><strong>{plan?.destination.name || `${activity.name} · ${activity.area}`}</strong><span>{plan?.meetingToDestination?.available ? `汇合后约 ${plan.meetingToDestination.summary}；活动预计 ${activity.durationHours[0]}–${activity.durationHours[1]} 小时。` : `预计 ${activity.durationHours[0]}–${activity.durationHours[1]} 小时；不自动生成分时日程。`}</span></div></div>
            <div className="timeline-item return"><span className="timeline-icon"><Navigation size={16} /></span><div><small>各自返程</small><strong>返回原出发地址</strong><span>返程前请重新查看实时路况、末班交通和市郊铁路官方班次。</span></div></div>
          </div>
        </section>

        <section className="route-card">
          <div className="panel-heading"><div><span className="section-kicker">每人交通对比</span><h3>同一目的地，分别计算每个人的距离</h3></div><TrainFront size={20} /></div>
          <div className="travel-table">
            <div className="travel-row header"><span>参与者</span><span><TrainFront size={14} /> 公交</span><span><Car size={14} /> 驾车</span><span><Bike size={14} /> 骑行 / 步行</span><span>市郊铁路</span></div>
            {users.map((user) => {
              const route = plan?.participants.find((participant) => participant.id === user.id);
              const rail = route?.estimates.transit.suburbanRail || [];
              return <div className="travel-row" key={user.id}><strong>{user.name}</strong><span>{estimateText(route?.estimates.transit)}</span><span>{estimateText(route?.estimates.driving)}</span><span>{route ? `骑 ${estimateText(route.estimates.bicycling)} / 步 ${estimateText(route.estimates.walking)}` : "待计算"}</span><span>{route ? rail.length ? rail.join("、") : "本路线未识别" : "待计算"}</span></div>;
            })}
          </div>
          <div className="truth-banner compact"><AlertCircle size={17} /><span>高德路线用于比较距离与预计耗时；市郊铁路班次属于实时信息，出发前仍要查看北京市郊铁路或 12306 官方信息。</span></div>
        </section>

        <section className="route-card checklist-card">
          <div><span className="section-kicker">出发前核验</span><h3>系统可以准备，但这些仍需确认</h3></div>
          <div className="checklist"><div><Check size={16} /> 营业时间、预约与票务</div><div><Check size={16} /> 当周活动或展览仍在进行</div><div><Check size={16} /> 天气是否适合户外路线</div><div><Check size={16} /> {activity.caveat}</div></div>
          <button className="primary-button" type="button" onClick={onDone}>保存这次方案</button>
        </section>
      </div>
    </section>
  );
}
