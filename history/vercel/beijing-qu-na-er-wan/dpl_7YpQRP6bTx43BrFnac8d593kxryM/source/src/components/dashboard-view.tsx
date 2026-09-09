import Image from "next/image";
import {
  ArrowRight,
  Dice5,
  MapPinned,
  Navigation,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { TripDraft } from "@/lib/types";
import { activityCountFromReference } from "@/lib/activity-data";

type DashboardViewProps = {
  draft: TripDraft;
  onDraftChange: (draft: TripDraft) => void;
  onStart: () => void;
  onOpenLibrary: () => void;
  integrations: { amap: boolean; deepseek: boolean; deepseekDataSharingEnabled: boolean; database: boolean; cloudSensitiveDataSharingEnabled: boolean };
};

const inspiration = [
  { title: "手作与创作", note: "陶艺、蓝晒、木工", tone: "lavender" },
  { title: "运动与挑战", note: "抱石、射箭、滑冰", tone: "apricot" },
  { title: "城市与自然", note: "夜游、观鸟、骑行", tone: "blue" },
];

export function DashboardView({ draft, onDraftChange, onStart, onOpenLibrary, integrations }: DashboardViewProps) {
  const completed = draft.participantIds.filter((id) => draft.answers[id].completed).length;

  return (
    <div className="content-grid">
      <section className="decision-card">
        <div className="decision-copy">
          <span className="status-pill"><Sparkles size={15} /> 新建一次出行</span>
          <h2>把“去哪儿”变成三个可以选的答案。</h2>
          <p>每个人分别填写位置、喜好和明确不接受的内容。系统先排除任何人的禁忌，再综合天气、距离、预算和季节给出三个候选。</p>

          <div className="mode-tabs" role="tablist" aria-label="推荐方式">
            <button
              className={draft.mode === "plan" ? "mode-tab active" : "mode-tab"}
              onClick={() => onDraftChange({ ...draft, mode: "plan" })}
              role="tab"
              aria-selected={draft.mode === "plan"}
              type="button"
            >
              <Navigation size={17} /> 我有大概想法
            </button>
            <button
              className={draft.mode === "surprise" ? "mode-tab active" : "mode-tab"}
              onClick={() => onDraftChange({ ...draft, mode: "surprise" })}
              role="tab"
              aria-selected={draft.mode === "surprise"}
              type="button"
            >
              <Dice5 size={17} /> 给我一点惊喜
            </button>
          </div>

          <div className="trip-summary">
            <div className="summary-row">
              <UsersRound size={19} aria-hidden="true" />
              <span className="summary-label">参与者</span>
              <div className="people-stack" aria-label="Serenity 和 zzz"><span>S</span><span>Z</span></div>
              <strong>Serenity、zzz</strong>
              <span className="summary-hint">{completed}/2 已回答</span>
            </div>
            <div className="summary-row">
              <MapPinned size={19} aria-hidden="true" />
              <span className="summary-label">出发地</span>
              <strong>分别填写具体地址</strong>
              <span className="summary-hint">系统判断汇合点</span>
            </div>
          </div>

          <div className="ready-line"><span>{draft.mode === "surprise" ? "保留禁忌 · 扩大兴趣范围" : "回答问题 · 生成可解释推荐"}</span><span>预计 2 分钟</span></div>
          <button className="primary-button" type="button" onClick={onStart}>开始回答问题 <ArrowRight size={18} aria-hidden="true" /></button>
        </div>

        <div className="hero-illustration">
          <Image src="/hero-weekend.png" alt="两位朋友从陶艺、攀岩和河畔夜游中选择周末活动的插画" fill priority sizes="(max-width: 900px) 100vw, 46vw" />
          <div className="illustration-note"><span>{activityCountFromReference}+ 活动方向</span><strong>从不知道想玩什么开始</strong></div>
        </div>
      </section>

      <aside className="inspiration-panel">
        <section className="panel-card weekend-card">
          <div className="panel-heading"><div><span className="section-kicker">本周适配</span><h3>{integrations.amap || integrations.deepseek ? "接入状态" : "实时条件接入后显示"}</h3></div><span className="soft-badge">{integrations.amap && integrations.deepseek ? "部分可用" : "需配置 API"}</span></div>
          <div className="condition-list">
            <div><span>天气</span><strong>不使用模拟数据</strong></div>
            <div><span>路线</span><strong>{integrations.amap ? "高德已配置" : "高德待配置"}</strong></div>
            <div><span>文字理解</span><strong>{integrations.deepseek ? "DeepSeek 已配置 · 每次确认" : "DeepSeek 待配置"}</strong></div>
            <div><span>云端空间</span><strong>{integrations.database && integrations.cloudSensitiveDataSharingEnabled ? "云同步已开启" : integrations.database ? "数据库已配 · 待授权" : "本机预览"}</strong></div>
          </div>
        </section>

        <section className="panel-card ideas-card">
          <div className="panel-heading"><div><span className="section-kicker">随便看看</span><h3>也许你还不知道会喜欢</h3></div><button className="text-button" type="button" onClick={onOpenLibrary}>活动库 <ArrowRight size={15} /></button></div>
          <div className="idea-list">
            {inspiration.map((item) => (
              <button className="idea-row" key={item.title} type="button" onClick={onOpenLibrary}>
                <span className={`idea-swatch ${item.tone}`} />
                <span><strong>{item.title}</strong><small>{item.note}</small></span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
