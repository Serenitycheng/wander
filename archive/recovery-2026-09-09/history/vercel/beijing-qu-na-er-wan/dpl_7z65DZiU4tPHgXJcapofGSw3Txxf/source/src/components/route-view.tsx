import {
  AlertCircle,
  ArrowLeft,
  Bike,
  Car,
  Check,
  CircleDot,
  Map,
  MapPin,
  Navigation,
  TrainFront,
  UsersRound,
} from "lucide-react";
import type { Recommendation, TripDraft } from "@/lib/types";

type RouteViewProps = {
  draft: TripDraft;
  selection: Recommendation;
  onBack: () => void;
  onDone: () => void;
};

export function RouteView({ draft, selection, onBack, onDone }: RouteViewProps) {
  const { activity } = selection;
  const users = draft.participantIds.map((id) => ({ id, name: id === "serenity" ? "Serenity" : "zzz", address: draft.answers[id].address }));

  return (
    <section className="route-view">
      <div className="route-heading">
        <div><button className="icon-text-button" type="button" onClick={onBack}><ArrowLeft size={17} /> 返回三个候选</button><span className="section-kicker">完整执行方案 · 不生成详细时刻表</span><h2>{activity.name}</h2><p>{activity.venue} · {activity.area}</p></div>
        <span className="selection-score">{selection.score}<small>综合匹配</small></span>
      </div>

      <div className="route-stack">
        <section className="route-card map-card">
          <div className="panel-heading"><div><span className="section-kicker">地图</span><h3>高德地图接入位</h3></div><span className="soft-badge">等待密钥</span></div>
          <div className="map-placeholder"><Map size={42} /><strong>地图会放在路线文字的上方</strong><span>配置高德 Web 服务 Key 与 JS Key 后，显示实际地图、路线和汇合点。</span></div>
        </section>

        <section className="route-card">
          <div className="panel-heading"><div><span className="section-kicker">地点顺序</span><h3>每个人出发 → 汇合 → 活动 → 各自返程</h3></div><Navigation size={20} /></div>
          <div className="route-timeline">
            {users.map((user) => <div className="timeline-item origin" key={user.id}><span className="timeline-icon"><MapPin size={16} /></span><div><small>{user.name} 出发</small><strong>{user.address || "尚未填写具体地址"}</strong><span>公共交通 / 驾车 / 骑行步行 / 市郊铁路：等待高德测算</span></div></div>)}
            <div className="timeline-join"><UsersRound size={18} /><span><strong>系统汇合点：待计算</strong><small>将综合两人的到达时间，而不是只取几何中点。</small></span></div>
            <div className="timeline-item destination"><span className="timeline-icon"><CircleDot size={17} /></span><div><small>共同活动</small><strong>{activity.name} · {activity.area}</strong><span>预计 {activity.durationHours[0]}–{activity.durationHours[1]} 小时；不自动生成分时日程。</span></div></div>
            <div className="timeline-item return"><span className="timeline-icon"><Navigation size={16} /></span><div><small>各自返程</small><strong>返回原出发地址</strong><span>将在接入后分别展示建议返程方式和末班交通提醒。</span></div></div>
          </div>
        </section>

        <section className="route-card">
          <div className="panel-heading"><div><span className="section-kicker">每人交通对比</span><h3>先保留所有交通方式，再选最合适的</h3></div><TrainFront size={20} /></div>
          <div className="travel-table">
            <div className="travel-row header"><span>参与者</span><span><TrainFront size={14} /> 公交</span><span><Car size={14} /> 驾车</span><span><Bike size={14} /> 骑行/步行</span><span>市郊铁路</span></div>
            {users.map((user) => <div className="travel-row" key={user.id}><strong>{user.name}</strong><span>待计算</span><span>待计算</span><span>待计算</span><span>待计算</span></div>)}
          </div>
          <div className="truth-banner compact"><AlertCircle size={17} /><span>市郊铁路只在路线相关时显示班次；班次属于实时信息，不能从基础资料里猜。</span></div>
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
