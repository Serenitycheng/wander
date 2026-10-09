"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { profileFor } from "../profile";
import { useExploration } from "./exploration-app";

export function DiscoveryPreferences() {
  const { space, update, notify } = useExploration();
  const profile = profileFor(space);
  const savedKey = JSON.stringify(profile);
  const [edit, setEdit] = useState({ savedKey, draft: profile });
  if (edit.savedKey !== savedKey) setEdit({ savedKey, draft: profile });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (update((value) => ({ ...value, preferences: { ...value.preferences, profile: edit.draft } })))
      notify("推荐偏好已保存，下次发现会参考它。");
  };
  return (
    <section className="exploration-setting exploration-discovery-setting">
      <div>
        <h2>让推荐更懂你一点</h2>
        <p>喜欢的内容提供线索，也留一部分给陌生领域。书单表示兴趣，不代表已经读过。</p>
      </div>
      <form className="exploration-profile-form" onSubmit={submit}>
        <label>
          <span>兴趣与偏好</span>
          <textarea rows={3} maxLength={1000} value={edit.draft.interests}
            placeholder="例如：喜欢故事和人物，也愿意唱歌、看视频或试点别的。"
            onChange={(event) => setEdit({ ...edit, draft: { ...edit.draft, interests: event.target.value } })} />
        </label>
        <label>
          <span>阅读清单或想了解的作品</span>
          <textarea rows={4} maxLength={2400} value={edit.draft.readingList}
            placeholder="书名、作者、电影或其他作品都可以写。"
            onChange={(event) => setEdit({ ...edit, draft: { ...edit.draft, readingList: event.target.value } })} />
        </label>
        <label className="exploration-profile-check">
          <input type="checkbox" checked={edit.draft.personalized}
            onChange={(event) => setEdit({ ...edit, draft: { ...edit.draft, personalized: event.target.checked } })} />
          <span>结合我的偏好和收藏推荐</span>
        </label>
        <label className="exploration-profile-check">
          <input type="checkbox" checked={edit.draft.allowFeeds}
            onChange={(event) => setEdit({ ...edit, draft: { ...edit.draft, allowFeeds: event.target.checked } })} />
          <span>偶尔推荐播客或博客</span>
        </label>
        <p>联网推荐会使用这些偏好和收藏标题，记录里的感受留在本机。</p>
        <button type="submit" className="exploration-secondary">保存推荐偏好</button>
      </form>
    </section>
  );
}
