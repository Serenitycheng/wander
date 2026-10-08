import { AlertCircle, CalendarDays, CloudSun, History, Plus, Sparkles } from "lucide-react";

export function WeekView({ onStart }: { onStart: () => void }) {
  return (
    <section className="utility-view">
      <div className="utility-hero"><span className="utility-icon"><CalendarDays size={28} /></span><span className="section-kicker">本周发生</span><h2>只展示能找到官方来源的内容。</h2><p>展览、演出、快闪、花期和季节项目都会带“来源、最后核验时间、是否仍需确认”。API 尚未配置时，这里保持空白而不是填充虚构活动。</p><button className="primary-button inline" type="button" onClick={onStart}><Plus size={17} /> 用基础活动库开始决定</button></div>
      <div className="utility-grid"><div><CloudSun size={20} /><strong>天气与花期</strong><span>高德天气 + 官方公园公告</span><small>待接入</small></div><div><Sparkles size={20} /><strong>展演与快闪</strong><span>官方页面或人工收录</span><small>待接入</small></div><div><AlertCircle size={20} /><strong>过期保护</strong><span>超过核验时限自动标黄</span><small>规则已设计</small></div></div>
    </section>
  );
}

export function HistoryView({ hasSavedTrip, onStart }: { hasSavedTrip: boolean; onStart: () => void }) {
  return (
    <section className="utility-view">
      <div className="utility-hero"><span className="utility-icon"><History size={28} /></span><span className="section-kicker">Serenity 的空间</span><h2>{hasSavedTrip ? "已经保存 1 次本机预览方案。" : "还没有保存过出行方案。"}</h2><p>正式接入云端后，行程只保存在发起人空间；Serenity 可以查看 zzz 的空间，但默认不覆盖对方数据。</p><button className="primary-button inline" type="button" onClick={onStart}><Plus size={17} /> 新建一次出行</button></div>
    </section>
  );
}
