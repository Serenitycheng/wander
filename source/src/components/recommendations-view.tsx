import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  CloudSun,
  Dice5,
  ExternalLink,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Sparkles,
  TrainFront,
  WalletCards,
} from "lucide-react";
import { normalizeActivityCategory } from "@/lib/types";
import type { Recommendation, TripDraft } from "@/lib/types";

type RecommendationsViewProps = {
  draft: TripDraft;
  recommendations: Recommendation[];
  onBack: () => void;
  onReroll: () => void;
  onSelect: (recommendation: Recommendation) => void;
  searchState: "loading" | "ready" | "error";
  sourceMessage: string;
};

const categoryTone: Record<string, string> = {
  "手作与创作": "lavender",
  "运动与挑战": "apricot",
  "自然与户外": "sage",
  "城市与文化": "blue",
  "表演与声音": "rose",
};

export function RecommendationsView({ draft, recommendations, onBack, onReroll, onSelect, searchState, sourceMessage }: RecommendationsViewProps) {
  const selectedCategories = [...new Set(draft.participantIds.flatMap((id) => draft.answers[id].interests).map(normalizeActivityCategory).filter(Boolean))];
  return (
    <section className="results-view">
      <div className="results-heading">
        <div>
          <button className="icon-text-button" type="button" onClick={onBack}><ArrowLeft size={17} /> 修改答案</button>
          <span className="section-kicker">本轮推荐 · 实时发现 + 规则可解释</span>
          <h2>先从这三个里面选一个。</h2>
          <p>先排除任何人明确不接受的项目，再结合所选类型、小红书公开线索、官方页面与高德具体地点。</p>
          <p><strong>{draft.mode === "surprise" ? "本轮模式：随机探索（不限制活动类型）" : `本轮硬筛：${selectedCategories.join("、") || "尚未选择活动类型"}`}</strong></p>
        </div>
        <button className="secondary-button" type="button" onClick={onReroll}>{draft.mode === "surprise" ? <Dice5 size={17} /> : <RefreshCw size={17} />} 换一组三个</button>
      </div>

      <div className={`truth-banner ${searchState === "error" ? "error" : ""}`}><AlertCircle size={19} /><span><strong>{searchState === "loading" ? "正在找具体活动、店铺和来源…" : searchState === "ready" ? "本轮来源状态" : "实时发现没有完整完成"}</strong> {sourceMessage}</span></div>

      {searchState === "loading" ? <div className="recommendation-loading"><span className="spin"><LoaderCircle size={24} /></span><strong>DeepSeek 正在发现公开网页，高德随后匹配具体地点</strong><p>每个人的地址、禁忌、预算和详细回答不会发送给联网搜索。</p></div> : <div className="recommendation-grid">
        {recommendations.map((recommendation, index) => {
          const { activity } = recommendation;
          return (
            <article className="recommendation-card" key={`${activity.id}-${index}`}>
              <div className={`recommendation-visual ${categoryTone[activity.category] ?? "sage"}`}>
                <span className="rank-number">0{index + 1}</span>
                <span className="score-ring">{recommendation.score}<small>匹配</small></span>
                <div><span>{activity.category}</span><strong>{activity.name}</strong></div>
              </div>
              <div className="recommendation-body">
                <div className="recommendation-title"><div><span className="verification-label">{activity.verification}</span><h3>{activity.takeaway}</h3></div><span className="area-pill"><MapPin size={12} /> {activity.area}</span></div>
                <p className="venue-line">建议场景：{activity.venue}</p>

                <div className="metric-grid">
                  <div><Clock3 size={16} /><span>预计用时<strong>{activity.durationHours[0]}–{activity.durationHours[1]} 小时</strong></span></div>
                  <div><WalletCards size={16} /><span>参考预算<strong>¥{activity.budgetYuan[0]}–{activity.budgetYuan[1]}/人</strong></span></div>
                  <div><CloudSun size={16} /><span>天气判断<strong>{activity.indoor ? "室内稳定" : "接入实时天气后判断"}</strong></span></div>
                  <div><TrainFront size={16} /><span>每人距离<strong>等待高德测算</strong></span></div>
                </div>

                <div className="why-list"><span>为什么入选</span>{recommendation.reasons.map((reason) => <div key={reason}><Check size={14} /> {reason}</div>)}</div>
                {recommendation.sources?.length ? <div className="recommendation-sources"><span>依据与线索</span>{recommendation.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={`${source.type}-${source.url}`}><b>{source.type === "official" ? "官方" : source.type === "xiaohongshu" ? "小红书线索" : "高德地点"}</b><em>{source.name}</em><ExternalLink size={13} /></a>)}</div> : null}
                <div className="caveat-line"><AlertCircle size={15} /><span>{recommendation.warnings[0] ?? activity.caveat}</span></div>
                <button className="primary-button" type="button" onClick={() => onSelect(recommendation)}>选这个，生成执行路线 <ArrowRight size={18} /></button>
              </div>
            </article>
          );
        })}
      </div>}

      {searchState !== "loading" ? <section className="compare-section">
        <div className="panel-heading"><div><span className="section-kicker">快速对比</span><h3>三个候选的差异</h3></div><Sparkles size={20} /></div>
        <div className="comparison-table" role="table" aria-label="推荐对比">
          <div className="compare-row header" role="row"><span>候选</span><span>体力</span><span>室内外</span><span>结果</span><span>事实状态</span></div>
          {recommendations.map(({ activity }, index) => <div className="compare-row" role="row" key={`${activity.id}-${index}`}><strong>{activity.name}</strong><span>{activity.energy}</span><span>{activity.indoor ? "室内" : "户外"}</span><span>{activity.takeaway}</span><span>{activity.verification}</span></div>)}
        </div>
      </section> : null}
    </section>
  );
}
