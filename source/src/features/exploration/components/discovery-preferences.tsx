"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { profileFor } from "../profile";
import { knownSpaceIdeas } from "../recommendation-policy";
import { useExploration } from "./exploration-app";

export function DiscoveryPreferences() {
  const { space, update, notify, voteIdea, cleanupRecommendations, restoreRecommendations, cleanupBackupAvailable } = useExploration();
  const known = knownSpaceIdeas(space);
  const profile = profileFor(space);
  const savedKey = JSON.stringify(profile);
  const [edit, setEdit] = useState({ savedKey, draft: profile });
  const [feedbackLimit, setFeedbackLimit] = useState(12);
  if (edit.savedKey !== savedKey) setEdit({ savedKey, draft: profile });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (update((value) => ({ ...value, preferences: { ...value.preferences, profile: edit.draft } })))
      notify("推荐偏好已保存。");
  };
  return (
    <section className="exploration-setting exploration-discovery-setting">
      <div>
        <h2>推荐偏好</h2>
      </div>
      <form className="exploration-profile-form" onSubmit={submit}>
        <label>
          <span>偏好说明</span>
          <textarea rows={7} maxLength={2000} value={edit.draft.preferenceNotes ?? ""}
            onChange={(event) => setEdit({ ...edit, draft: { ...edit.draft, preferenceNotes: event.target.value } })} />
        </label>
        <label>
          <span>兴趣与偏好</span>
          <textarea rows={3} maxLength={1000} value={edit.draft.interests}
            onChange={(event) => setEdit({ ...edit, draft: { ...edit.draft, interests: event.target.value } })} />
        </label>
        <label>
          <span>阅读清单或想了解的作品</span>
          <textarea rows={4} maxLength={2400} value={edit.draft.readingList}
            onChange={(event) => setEdit({ ...edit, draft: { ...edit.draft, readingList: event.target.value } })} />
        </label>
        <label>
          <span>暂时不想看的领域</span>
          <input type="text" maxLength={240} value={edit.draft.mutedTopics ?? ""}
            placeholder="用逗号分隔；清空后恢复推荐"
            onChange={(event) => setEdit({ ...edit, draft: { ...edit.draft, mutedTopics: event.target.value } })} />
        </label>
        <label className="exploration-profile-check">
          <input type="checkbox" checked={edit.draft.personalized}
            onChange={(event) => setEdit({ ...edit, draft: { ...edit.draft, personalized: event.target.checked } })} />
          <span>结合我的偏好、收藏和反馈推荐</span>
        </label>
        <label className="exploration-profile-check">
          <input type="checkbox" checked={edit.draft.allowFeeds}
            onChange={(event) => setEdit({ ...edit, draft: { ...edit.draft, allowFeeds: event.target.checked } })} />
          <span>偶尔推荐播客或博客</span>
        </label>
        <p>记录里的感受不会发送给推荐服务。</p>
        <button type="submit" className="exploration-secondary">保存推荐偏好</button>
      </form>
      {space.feedback?.length ? <details className="exploration-feedback-history">
        <summary>反馈记录 · {space.feedback.length}</summary>
        <ul>{space.feedback.slice(0, feedbackLimit).map((item) => <li key={item.ideaId}>
          <span>{known.get(item.ideaId)?.title ?? "推荐"}<small>{item.vote === "more" ? "感兴趣" : "不感兴趣"}</small></span>
          <button type="button" aria-label={`撤销反馈：${known.get(item.ideaId)?.title ?? "推荐"}`}
            onClick={() => voteIdea(item.ideaId, item.vote, true)}>撤销</button>
        </li>)}</ul>
        {space.feedback.length > feedbackLimit ? <button type="button" className="exploration-text-link"
          onClick={() => setFeedbackLimit((limit) => limit + 12)}>查看更早的反馈</button> : null}
      </details> : null}
      <div className="exploration-backup-actions">
        <button type="button" className="exploration-secondary" onClick={cleanupRecommendations}>清理旧推荐</button>
        {cleanupBackupAvailable ? <button type="button" className="exploration-text-link" onClick={restoreRecommendations}>恢复清理前候选</button> : null}
      </div>
      <p>清理前自动备份；保留感兴趣、收藏、记录和配色。</p>
    </section>
  );
}
