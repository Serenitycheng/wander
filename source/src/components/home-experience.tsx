"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppFrame } from "@/components/app-frame";
import { DashboardView } from "@/components/dashboard-view";
import { HistoryView, WeekView } from "@/components/utility-views";
import { LibraryView } from "@/components/library-view";
import { LoginView } from "@/components/login-view";
import { QuestionnaireView } from "@/components/questionnaire-view";
import { RecommendationsView } from "@/components/recommendations-view";
import { RouteView } from "@/components/route-view";
import { buildRecommendations } from "@/lib/recommendation";
import { createTripDraft, normalizeTripDraft, type Recommendation, type RecommendationSearchResult, type TripDraft, type UserId, type ViewName } from "@/lib/types";

type StoredSpace = {
  draft: TripDraft;
  revision: number;
  editor: UserId;
};

type CloudWorkspace = StoredSpace & {
  savedTrip: boolean;
  updatedAt: string;
  versionId: number | null;
};

const storageKey = (user: UserId) => `beijing-play:space:${user}`;

export function HomeExperience() {
  const requireAuth = process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";
  const [view, setView] = useState<ViewName>("dashboard");
  const [theme, setTheme] = useState<"sage" | "lavender">("sage");
  const [activeUser, setActiveUser] = useState<UserId>("serenity");
  const [viewerUser, setViewerUser] = useState<UserId | null>(requireAuth ? null : "serenity");
  const [authChecked, setAuthChecked] = useState(!requireAuth);
  const [draft, setDraft] = useState<TripDraft>(() => createTripDraft());
  const [selection, setSelection] = useState<Recommendation | null>(null);
  const [liveRecommendations, setLiveRecommendations] = useState<Recommendation[] | null>(null);
  const [recommendationState, setRecommendationState] = useState<"loading" | "ready" | "error">("loading");
  const [recommendationMessage, setRecommendationMessage] = useState("正在结合公开网页与高德具体地点生成候选。");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "conflict" | "error">("saved");
  const [hasSavedTrip, setHasSavedTrip] = useState(false);
  const [integrations, setIntegrations] = useState({ amap: false, deepseek: false, deepseekDataSharingEnabled: false, database: false, cloudSensitiveDataSharingEnabled: false });
  const latestRevision = useRef(0);
  const loadedUser = useRef<UserId | null>(null);
  const conflictRef = useRef(false);

  const localRecommendations = useMemo(() => buildRecommendations(draft), [draft]);
  const recommendations = liveRecommendations ?? localRecommendations;
  const cloudEnabled = Boolean(viewerUser && integrations.database && integrations.cloudSensitiveDataSharingEnabled);

  useEffect(() => {
    if (!requireAuth) return;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { authenticated?: boolean; user?: { id?: UserId } | null }) => {
        if (payload.authenticated && payload.user?.id) {
          setViewerUser(payload.user.id);
          setActiveUser(payload.user.id);
        }
      })
      .catch(() => undefined)
      .finally(() => setAuthChecked(true));
  }, [requireAuth]);

  useEffect(() => {
    fetch("/api/integrations/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: typeof integrations) => setIntegrations(payload))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (view !== "recommendations") return;
    const controller = new AbortController();
    const sanitizeAnswer = (answer: TripDraft["answers"][UserId]) => ({ ...answer, address: "", freeText: "", aiSummary: "", aiConstraints: [] });
    const safeDraft: TripDraft = {
      ...draft,
      answers: { serenity: sanitizeAnswer(draft.answers.serenity), zzz: sanitizeAnswer(draft.answers.zzz) },
    };
    fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: safeDraft }),
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json().catch(() => null) as (RecommendationSearchResult & { error?: string }) | null;
      if (!response.ok || !payload) throw new Error(payload?.error || "实时推荐接口暂时无法访问。");
      setLiveRecommendations(payload.recommendations);
      setRecommendationMessage(payload.message);
      setRecommendationState(payload.sourceStatus === "complete" ? "ready" : "error");
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setRecommendationMessage(`${error instanceof Error ? error.message : "实时推荐暂时无法访问"} 已显示严格命中所选类型的基础候选，不会用虚构地点补位。`);
      setRecommendationState("error");
    });
    return () => controller.abort();
  }, [draft, view]);

  useEffect(() => {
    let cancelled = false;
    loadedUser.current = null;
    const loadLocalSpace = () => {
      const raw = window.localStorage.getItem(storageKey(activeUser));
      let nextDraft = createTripDraft(activeUser);
      let nextRevision = 0;
      if (raw) {
        try {
          const stored = JSON.parse(raw) as StoredSpace;
          nextDraft = normalizeTripDraft(stored.draft);
          nextRevision = stored.revision;
        } catch { /* Invalid local data starts a fresh space. */ }
      }
      return { draft: nextDraft, revision: nextRevision, savedTrip: window.localStorage.getItem(`beijing-play:history:${activeUser}`) === "1" };
    };
    const finishLoad = (space: { draft: TripDraft; revision: number; savedTrip: boolean }) => {
      if (cancelled) return;
      setDraft(normalizeTripDraft(space.draft));
      latestRevision.current = space.revision;
      setHasSavedTrip(space.savedTrip);
      setSaveState("saved");
      conflictRef.current = false;
      loadedUser.current = activeUser;
      setView("dashboard");
      setSelection(null);
    };
    const timeout = window.setTimeout(async () => {
      if (!cloudEnabled) {
        finishLoad(loadLocalSpace());
        return;
      }
      try {
        const response = await fetch(`/api/workspace?space=${activeUser}`, { cache: "no-store" });
        const payload = await response.json().catch(() => null) as { workspace?: CloudWorkspace | null; error?: string } | null;
        if (!response.ok || !payload) throw new Error(payload?.error || "云空间读取失败");
        if (payload.workspace) finishLoad(payload.workspace);
        else finishLoad({ ...loadLocalSpace(), revision: 0 });
      } catch {
        if (cancelled) return;
        const local = loadLocalSpace();
        setDraft(local.draft);
        latestRevision.current = local.revision;
        setHasSavedTrip(local.savedTrip);
        setSaveState("error");
        conflictRef.current = true;
        loadedUser.current = activeUser;
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [activeUser, cloudEnabled]);

  useEffect(() => {
    if (loadedUser.current !== activeUser || conflictRef.current) return;
    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      if (conflictRef.current) return;
      if (cloudEnabled) {
        fetch("/api/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId: activeUser, draft, expectedRevision: latestRevision.current, savedTrip: hasSavedTrip }),
        }).then(async (response) => {
          const payload = await response.json().catch(() => null) as { workspace?: CloudWorkspace; error?: string; code?: string } | null;
          if (response.status === 409 || payload?.code === "REVISION_CONFLICT") {
            conflictRef.current = true;
            setSaveState("conflict");
            return;
          }
          if (!response.ok || !payload?.workspace) throw new Error(payload?.error || "云端保存失败");
          latestRevision.current = payload.workspace.revision;
          setSaveState("saved");
        }).catch(() => setSaveState("error"));
        return;
      }
      const revision = Date.now();
      window.localStorage.setItem(storageKey(activeUser), JSON.stringify({ draft, revision, editor: activeUser } satisfies StoredSpace));
      latestRevision.current = revision;
      setSaveState("saved");
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [activeUser, cloudEnabled, draft, hasSavedTrip]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey(activeUser) || !event.newValue) return;
      try {
        const incoming = JSON.parse(event.newValue) as StoredSpace;
        if (incoming.revision > latestRevision.current) {
          conflictRef.current = true;
          setSaveState("conflict");
        }
      } catch {
        // Invalid external storage never replaces the current draft.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [activeUser]);

  const navigate = (nextView: ViewName) => {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const generate = () => {
    setSelection(null);
    setLiveRecommendations(null);
    setRecommendationState("loading");
    setRecommendationMessage("正在结合 DeepSeek 联网发现、小红书公开线索、官方页面和高德具体地点生成。");
    navigate("recommendations");
  };

  const rerollRecommendations = () => {
    setLiveRecommendations(null);
    setRecommendationState("loading");
    setRecommendationMessage("正在换一组具体活动、店铺与来源。");
    setDraft((current) => ({ ...current, roll: current.roll + 1 }));
  };

  const chooseRecommendation = (recommendation: Recommendation) => {
    setSelection(recommendation);
    navigate("route");
  };

  const saveTrip = () => {
    if (!cloudEnabled) window.localStorage.setItem(`beijing-play:history:${activeUser}`, "1");
    setHasSavedTrip(true);
    navigate("history");
  };

  if (!authChecked) return <main className="loading-page"><span className="brand-mark">北</span><p>正在确认你的空间…</p></main>;
  if (requireAuth && !viewerUser) return <LoginView onAuthenticated={(user) => { setViewerUser(user); setActiveUser(user); }} />;
  const allowedUsers: UserId[] = viewerUser === "serenity" ? ["serenity", "zzz"] : ["zzz"];

  return (
    <AppFrame view={view} onNavigate={navigate} theme={theme} onThemeChange={setTheme} activeUser={activeUser} onUserChange={setActiveUser} allowedUsers={allowedUsers} saveState={saveState} cloudEnabled={cloudEnabled}>
      {view === "dashboard" ? <DashboardView draft={draft} onDraftChange={setDraft} onStart={() => navigate("questionnaire")} onOpenLibrary={() => navigate("library")} integrations={integrations} /> : null}
      {view === "questionnaire" ? <QuestionnaireView draft={draft} onDraftChange={setDraft} onCancel={() => navigate("dashboard")} onGenerate={generate} deepseekConfigured={integrations.deepseek} /> : null}
      {view === "recommendations" ? <RecommendationsView draft={draft} recommendations={recommendations} searchState={recommendationState} sourceMessage={recommendationMessage} onBack={() => navigate("questionnaire")} onReroll={rerollRecommendations} onSelect={chooseRecommendation} /> : null}
      {view === "route" && selection ? <RouteView draft={draft} selection={selection} amapConfigured={integrations.amap} onBack={() => navigate("recommendations")} onDone={saveTrip} /> : null}
      {view === "library" ? <LibraryView onUseActivity={() => navigate("questionnaire")} /> : null}
      {view === "week" ? <WeekView onStart={() => navigate("questionnaire")} amapConfigured={integrations.amap} deepseekConfigured={integrations.deepseek} /> : null}
      {view === "history" ? <HistoryView hasSavedTrip={hasSavedTrip} onStart={() => navigate("questionnaire")} /> : null}
    </AppFrame>
  );
}
