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
import { createTripDraft, type Recommendation, type TripDraft, type UserId, type ViewName } from "@/lib/types";

type StoredSpace = {
  draft: TripDraft;
  revision: number;
  editor: UserId;
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
  const [saveState, setSaveState] = useState<"saved" | "saving" | "conflict">("saved");
  const [hasSavedTrip, setHasSavedTrip] = useState(false);
  const [integrations, setIntegrations] = useState({ amap: false, deepseek: false, deepseekDataSharingEnabled: false, database: false, cloudSensitiveDataSharingEnabled: false });
  const latestRevision = useRef(0);
  const loadedUser = useRef<UserId | null>(null);
  const conflictRef = useRef(false);

  const recommendations = useMemo(() => buildRecommendations(draft), [draft]);

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
    loadedUser.current = null;
    const timeout = window.setTimeout(() => {
      const raw = window.localStorage.getItem(storageKey(activeUser));
      if (raw) {
        try {
          const stored = JSON.parse(raw) as StoredSpace;
          setDraft(stored.draft);
          latestRevision.current = stored.revision;
        } catch {
          setDraft(createTripDraft());
          latestRevision.current = 0;
        }
      } else {
        setDraft(createTripDraft());
        latestRevision.current = 0;
      }
      setHasSavedTrip(window.localStorage.getItem(`beijing-play:history:${activeUser}`) === "1");
      setSaveState("saved");
      conflictRef.current = false;
      loadedUser.current = activeUser;
      setView("dashboard");
      setSelection(null);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeUser]);

  useEffect(() => {
    if (loadedUser.current !== activeUser || conflictRef.current) return;
    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      if (conflictRef.current) return;
      const revision = Date.now();
      const stored: StoredSpace = { draft, revision, editor: activeUser };
      window.localStorage.setItem(storageKey(activeUser), JSON.stringify(stored));
      latestRevision.current = revision;
      setSaveState("saved");
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [activeUser, draft]);

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
    navigate("recommendations");
  };

  const chooseRecommendation = (recommendation: Recommendation) => {
    setSelection(recommendation);
    navigate("route");
  };

  const saveTrip = () => {
    window.localStorage.setItem(`beijing-play:history:${activeUser}`, "1");
    setHasSavedTrip(true);
    navigate("history");
  };

  if (!authChecked) return <main className="loading-page"><span className="brand-mark">北</span><p>正在确认你的空间…</p></main>;
  if (requireAuth && !viewerUser) return <LoginView onAuthenticated={(user) => { setViewerUser(user); setActiveUser(user); }} />;
  const allowedUsers: UserId[] = viewerUser === "serenity" ? ["serenity", "zzz"] : ["zzz"];

  return (
    <AppFrame view={view} onNavigate={navigate} theme={theme} onThemeChange={setTheme} activeUser={activeUser} onUserChange={setActiveUser} allowedUsers={allowedUsers} saveState={saveState}>
      {view === "dashboard" ? <DashboardView draft={draft} onDraftChange={setDraft} onStart={() => navigate("questionnaire")} onOpenLibrary={() => navigate("library")} integrations={integrations} /> : null}
      {view === "questionnaire" ? <QuestionnaireView draft={draft} onDraftChange={setDraft} onCancel={() => navigate("dashboard")} onGenerate={generate} /> : null}
      {view === "recommendations" ? <RecommendationsView draft={draft} recommendations={recommendations} onBack={() => navigate("questionnaire")} onReroll={() => setDraft((current) => ({ ...current, roll: current.roll + 1 }))} onSelect={chooseRecommendation} /> : null}
      {view === "route" && selection ? <RouteView draft={draft} selection={selection} onBack={() => navigate("recommendations")} onDone={saveTrip} /> : null}
      {view === "library" ? <LibraryView onUseActivity={() => navigate("questionnaire")} /> : null}
      {view === "week" ? <WeekView onStart={() => navigate("questionnaire")} /> : null}
      {view === "history" ? <HistoryView hasSavedTrip={hasSavedTrip} onStart={() => navigate("questionnaire")} /> : null}
    </AppFrame>
  );
}
