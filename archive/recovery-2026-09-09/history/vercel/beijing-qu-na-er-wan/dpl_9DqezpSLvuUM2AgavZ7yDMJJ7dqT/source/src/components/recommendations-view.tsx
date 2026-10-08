import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  CloudSun,
  Dice5,
  MapPin,
  RefreshCw,
  Sparkles,
  TrainFront,
  WalletCards,
} from "lucide-react";
import type { Recommendation, TripDraft } from "@/lib/types";

type RecommendationsViewProps = {
  draft: TripDraft;
  recommendations: Recommendation[];
  onBack: () => void;
  onReroll: () => void;
  onSelect: (recommendation: Recommendation) => void;
};

const categoryTone: Record<string, string> = {
  "手作与创作": "lavender",
  "运动与挑战": "apricot",
  "自然与户外": "sage",
  "城市与摄影": "blue",
  "表演与声音": "rose",
};

export function RecommendationsView({ draft, recommendations, onBack, onReroll, onSelect }: RecommendationsViewProps) {
  return (
    <section className="results-view">
      <div className="results-heading">
        <div>
          <button className="icon-text-button" type="button" onClick={onBack}><ArrowLeft size={17} /> 修改答案</button>
          <span className="section-kicker">本轮推荐 · 规则可解释</span>
          <h2>先从这三个里面选一个。</h2>
          <p>已先处理所有人的明确排除；地址路线、实时天气和营业信息将在密钥配置后补齐。</p>
        </div>
        <button className="secondary-button" type="button" onClick={onReroll}>{draft.mode === "surprise" ? <Dice5 size={17} /> : <RefreshCw size={17} />} 换一组三个</button>
      </div>

      <div className="truth-banner"><AlertCircle size={19} /><span><strong>不会把模拟信息当实时信息。</strong> “需确认”代表系统还没有拿到官方当周来源或高德实时结果。</span></div>

      <div className="recommendation-grid">
        {recommendations.map((recommendation, index) => {
          const { activity } = recommendation;
          return (
            <article className="recommendation-card" key={activity.id}>
              <div className={`recommendation-visual ${categoryTone[activity.category] ?? "sage"}`}>
                <span className="rank-number">0{index + 1}</span>
                <span className="score-ring">{recommendation.score}<small>匹配</small></span>
                <div><span>{activity.category}</span><strong>{activity.takeaway}</strong></div>
              </div>
              <div className="recommendation-body">
                <div className="recommendation-title"><div><span className="verification-label">{activity.verification}</span><h3>{activity.name}</h3></div><span className="area-pill"><MapPin size={12} /> {activity.area}</span></div>
                <p className="venue-line">建议场景：{activity.venue}</p>

                <div className="metric-grid">
                  <div><Clock3 size={16} /><span>预计用时<strong>{activity.durationHours[0]}–{activity.durationHours[1]} 小时</strong></span></div>
                  <div><WalletCards size={16} /><span>参考预算<strong>¥{activity.budgetYuan[0]}–{activity.budgetYuan[1]}/人</strong></span></div>
                  <div><CloudSun size={16} /><span>天气判断<strong>{activity.indoor ? "室内稳定" : "接入实时天气后判断"}</strong></span></div>
                  <div><TrainFront size={16} /><span>每人距离<strong>等待高德测算</strong></span></div>
                </div>

                <div className="why-list"><span>为什么入选</span>{recommendation.reasons.map((reason) => <div key={reason}><Check size={14} /> {reason}</div>)}</div>
                <div className="caveat-line"><AlertCircle size={15} /><span>{recommendation.warnings[0] ?? activity.caveat}</span></div>
                <button className="primary-button" type="button" onClick={() => onSelect(recommendation)}>选这个，生成执行路线 <ArrowRight size={18} /></button>
              </div>
            </article>
          );
        })}
      </div>

      <section className="compare-section">
        <div className="panel-heading"><div><span className="section-kicker">快速对比</span><h3>三个候选的差异</h3></div><Sparkles size={20} /></div>
        <div className="comparison-table" role="table" aria-label="推荐对比">
          <div className="compare-row header" role="row"><span>候选</span><span>体力</span><span>室内外</span><span>结果</span><span>事实状态</span></div>
          {recommendations.map(({ activity }) => <div className="compare-row" role="row" key={activity.id}><strong>{activity.name}</strong><span>{activity.energy}</span><span>{activity.indoor ? "室内" : "户外"}</span><span>{activity.takeaway}</span><span>{activity.verification}</span></div>)}
        </div>
      </section>
    </section>
  );
}
