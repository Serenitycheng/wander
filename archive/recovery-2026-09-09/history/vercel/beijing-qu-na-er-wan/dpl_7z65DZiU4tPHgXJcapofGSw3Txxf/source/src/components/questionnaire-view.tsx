"use client";

import { ArrowLeft, ArrowRight, Check, MapPin, Sparkles, UsersRound } from "lucide-react";
import { useState } from "react";
import { activityCategories } from "@/lib/activity-data";
import type { EnergyLevel, ParticipantAnswer, TripDraft, UserId } from "@/lib/types";

type QuestionnaireViewProps = {
  draft: TripDraft;
  onDraftChange: (draft: TripDraft) => void;
  onCancel: () => void;
  onGenerate: () => void;
};

const steps = ["出行成员", "时间与预算", "想玩什么", "这次的感觉", "明确排除", "最后补充"];
const vibes = ["想带回作品", "想学一个新技能", "轻松恢复", "想拍照", "想看当周内容", "来点没试过的"];
const vetoOptions = ["怕高 / 高空", "水上项目", "不想运动", "不想户外 / 怕晒", "人多拥挤", "夜间太晚", "高消费", "强社交表达"];
const transports: TripDraft["transport"][number][] = ["公共交通", "驾车", "骑行步行", "市郊铁路"];

const toggleValue = <T,>(values: T[], value: T) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

export function QuestionnaireView({ draft, onDraftChange, onCancel, onGenerate }: QuestionnaireViewProps) {
  const [step, setStep] = useState(0);
  const [activeParticipant, setActiveParticipant] = useState<UserId>("serenity");
  const activeAnswer = draft.answers[activeParticipant];
  const completedCount = draft.participantIds.filter((id) => draft.answers[id].completed).length;

  const updateAnswer = (user: UserId, patch: Partial<ParticipantAnswer>) => {
    onDraftChange({
      ...draft,
      answers: { ...draft.answers, [user]: { ...draft.answers[user], ...patch, completed: false } },
      updatedAt: new Date().toISOString(),
    });
  };

  const updateGlobal = (patch: Partial<TripDraft>) => onDraftChange({ ...draft, ...patch, updatedAt: new Date().toISOString() });

  const markCompleted = () => {
    onDraftChange({
      ...draft,
      answers: { ...draft.answers, [activeParticipant]: { ...activeAnswer, completed: true } },
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <section className="questionnaire-layout">
      <div className="question-main">
        <div className="question-header">
          <button className="icon-text-button" type="button" onClick={onCancel}><ArrowLeft size={17} /> 返回首页</button>
          <span>{step + 1} / {steps.length}</span>
        </div>
        <div className="progress-track"><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>

        <div className="question-title">
          <span className="section-kicker">{steps[step]}</span>
          <h2>{step === 0 ? "这次谁一起去，从哪里出发？" : step === 1 ? "给周末划一个舒服的边界。" : step === 2 ? "先选想靠近的方向。" : step === 3 ? "这次更想获得什么感受？" : step === 4 ? "任何一个人明确不接受，就直接排除。" : "还有什么需求？"}</h2>
          <p>{step === 2 ? "可以多选；不知道想玩什么时，直接选“给我惊喜”也可以。" : step === 5 ? "这段话会交给 DeepSeek 解析成约束，但事实核验和最终排序仍由规则完成。" : "每个人的回答独立保存，发起人可以在未全部回答时强制生成。"}</p>
        </div>

        <div className="participant-tabs" role="tablist" aria-label="当前填写人">
          {draft.participantIds.map((participant) => {
            const name = participant === "serenity" ? "Serenity" : "zzz";
            return (
              <button
                key={participant}
                className={activeParticipant === participant ? "participant-tab active" : "participant-tab"}
                type="button"
                role="tab"
                aria-selected={activeParticipant === participant}
                onClick={() => setActiveParticipant(participant)}
              >
                <span className="mini-avatar">{name[0].toUpperCase()}</span>
                {name}
                {draft.answers[participant].completed ? <Check size={14} /> : null}
              </button>
            );
          })}
        </div>

        <div className="question-body">
          {step === 0 ? (
            <div className="field-stack">
              <label className="field-label"><span><MapPin size={16} /> {activeParticipant === "serenity" ? "Serenity" : "zzz"} 的具体出发地址</span><input value={activeAnswer.address} onChange={(event) => updateAnswer(activeParticipant, { address: event.target.value })} placeholder="例如：北京市房山区良乡大学城地铁站" autoComplete="street-address" /></label>
              <label className="field-label"><span>计划日期</span><input type="date" value={draft.date} onChange={(event) => updateGlobal({ date: event.target.value })} /></label>
              <div className="info-note"><UsersRound size={18} /><span>第一版固定支持 Serenity 和 zzz。公开注册与游客模式放到后续版本。</span></div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="field-stack">
              <label className="range-field"><span>可用总时长 <strong>{draft.availableHours} 小时</strong></span><input type="range" min="2" max="10" step="1" value={draft.availableHours} onChange={(event) => updateGlobal({ availableHours: Number(event.target.value) })} /></label>
              <label className="range-field"><span>每人预算上限 <strong>¥{draft.budgetPerPerson}</strong></span><input type="range" min="100" max="1500" step="50" value={draft.budgetPerPerson} onChange={(event) => updateGlobal({ budgetPerPerson: Number(event.target.value) })} /></label>
              <label className="range-field"><span>可接受单程 <strong>{draft.maxOneWayMinutes} 分钟</strong></span><input type="range" min="30" max="180" step="15" value={draft.maxOneWayMinutes} onChange={(event) => updateGlobal({ maxOneWayMinutes: Number(event.target.value) })} /></label>
              <div><span className="field-caption">需要综合的交通方式</span><div className="chip-grid compact">{transports.map((transport) => <button className={draft.transport.includes(transport) ? "choice-chip selected" : "choice-chip"} key={transport} type="button" onClick={() => updateGlobal({ transport: toggleValue(draft.transport, transport) })}>{draft.transport.includes(transport) ? <Check size={14} /> : null}{transport}</button>)}</div></div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="field-stack">
              <div className="chip-grid categories">{activityCategories.map((category) => <button className={activeAnswer.interests.includes(category) ? "choice-chip selected" : "choice-chip"} key={category} type="button" onClick={() => updateAnswer(activeParticipant, { interests: toggleValue(activeAnswer.interests, category) })}>{activeAnswer.interests.includes(category) ? <Check size={14} /> : null}{category}</button>)}</div>
              <button className={draft.mode === "surprise" ? "surprise-choice selected" : "surprise-choice"} type="button" onClick={() => updateGlobal({ mode: draft.mode === "surprise" ? "plan" : "surprise" })}><Sparkles size={20} /><span><strong>我不知道想尝试什么</strong><small>扩大类别随机探索，但仍遵守每个人的禁忌、预算和距离。</small></span></button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="field-stack">
              <div><span className="field-caption">希望获得的感觉</span><div className="chip-grid">{vibes.map((vibe) => <button className={activeAnswer.vibes.includes(vibe) ? "choice-chip selected" : "choice-chip"} key={vibe} type="button" onClick={() => updateAnswer(activeParticipant, { vibes: toggleValue(activeAnswer.vibes, vibe) })}>{activeAnswer.vibes.includes(vibe) ? <Check size={14} /> : null}{vibe}</button>)}</div></div>
              <div><span className="field-caption">体力强度（本次统一）</span><div className="segmented-control">{(["轻松", "适中", "有挑战"] as EnergyLevel[]).map((energy) => <button className={draft.energy === energy ? "active" : ""} key={energy} type="button" onClick={() => updateGlobal({ energy })}>{energy}</button>)}</div></div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="field-stack">
              <div className="chip-grid">{vetoOptions.map((veto) => <button className={activeAnswer.vetoes.includes(veto) ? "choice-chip danger selected" : "choice-chip danger"} key={veto} type="button" onClick={() => updateAnswer(activeParticipant, { vetoes: toggleValue(activeAnswer.vetoes, veto) })}>{activeAnswer.vetoes.includes(veto) ? <Check size={14} /> : null}{veto}</button>)}</div>
              <label className="field-label"><span>其他明确不接受</span><input value={activeAnswer.vetoes.find((item) => item.startsWith("其他："))?.replace("其他：", "") ?? ""} onChange={(event) => updateAnswer(activeParticipant, { vetoes: [...activeAnswer.vetoes.filter((item) => !item.startsWith("其他：")), ...(event.target.value ? [`其他：${event.target.value}`] : [])] })} placeholder="例如：不排队、不去商场、不做需要换装的项目" /></label>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="field-stack">
              <label className="field-label"><span>还有什么需求？</span><textarea rows={7} value={activeAnswer.freeText} onChange={(event) => updateAnswer(activeParticipant, { freeText: event.target.value })} placeholder="例如：最近很累，不想太早起；想试一个以前没做过、能带回作品的活动；如果下雨就全部安排在室内。" /></label>
              <button className={activeAnswer.completed ? "completion-card complete" : "completion-card"} type="button" onClick={markCompleted}><span className="completion-check"><Check size={20} /></span><span><strong>{activeParticipant === "serenity" ? "Serenity" : "zzz"} 的回答完成</strong><small>再次修改任何答案会自动恢复为“待确认”。</small></span></button>
            </div>
          ) : null}
        </div>

        <div className="question-actions">
          <button className="secondary-button" type="button" onClick={() => step === 0 ? onCancel() : setStep(step - 1)}><ArrowLeft size={17} /> 上一步</button>
          {step < steps.length - 1 ? <button className="primary-button inline" type="button" onClick={() => setStep(step + 1)}>下一步 <ArrowRight size={17} /></button> : <button className="primary-button inline" type="button" onClick={onGenerate}>{completedCount === draft.participantIds.length ? "生成 3 个候选" : "仍然生成（有人未确认）"}<ArrowRight size={17} /></button>}
        </div>
      </div>

      <aside className="question-side">
        <span className="section-kicker">回答状态</span>
        <h3>{completedCount} / {draft.participantIds.length} 人确认</h3>
        <div className="answer-status-list">
          {draft.participantIds.map((participant) => <div key={participant}><span className="mini-avatar">{participant === "serenity" ? "S" : "Z"}</span><span><strong>{participant === "serenity" ? "Serenity" : "zzz"}</strong><small>{draft.answers[participant].address || "还没有填写出发地"}</small></span><span className={draft.answers[participant].completed ? "answer-state complete" : "answer-state"}>{draft.answers[participant].completed ? "已确认" : "待确认"}</span></div>)}
        </div>
        <div className="rule-card"><strong>硬规则</strong><p>任何一个人明确排除的项目，都会先从候选池移除，不参与后续加权。</p></div>
        <div className="rule-card muted"><strong>路线说明</strong><p>现在保存具体地址；接入高德后再计算每个人的交通方式和系统汇合点。</p></div>
      </aside>
    </section>
  );
}
