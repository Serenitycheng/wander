"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Compass, Home, NotebookPen, UserRound } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { defaultTone, isTone, readableTone, resetSpaceTone, spaceTone, withSpaceTone } from "../appearance";
import { PageColorPicker } from "./page-color-picker";
import { LoginView } from "@/components/auth/space-login";
import { findIdea } from "../ideas";
import { fillMissingSuggestions, selectDiscoveredSuggestions } from "../discovery-client";
import { DiscoveryBuffer, discoveryScope } from "../discovery-buffer";
import { DiscoveryReserve, reserveContext, reserveIntervalMs } from "../discovery-reserve";
import { withExplorationAxes } from "../exploration-filters";
import { normalizeFilters } from "../generator";
import { canRetryDiscovery, discoveryNoteFor, isDiscoveryFailure } from "../discovery-status";
import { rememberShown } from "../discovery";
import { workHistory } from "../work-history";
import { isRejectedIdea } from "../recommendation-ranking";
import { freshOnly, knownSpaceIdeas, maxFeedback, preserveSnapshotIds, suppressionFor } from "../recommendation-policy";
import { cleanupStoredRecommendations, needsRecommendationCleanup, readRecommendationBackup, restoreRecommendationCache } from "../recommendation-cleanup";
import {
  createEmptySpace,
  readStoredSpace,
  saveStoredSpace,
  explorationStorageKey,
  mergeDiscoveredIdeas,
} from "../storage";
import type {
  ExplorationFilters,
  ExplorationIdea,
  ExplorationRecord,
  ExplorationSpace,
  ExplorationSuggestion,
  SpaceOwner,
} from "../types";

type SaveStatus = "loading" | "saved" | "conflict" | "invalid" | "unavailable";
type ExplorationContextValue = {
  space: ExplorationSpace;
  owner: SpaceOwner;
  allowedUsers: SpaceOwner[];
  authenticated: boolean;
  status: SaveStatus;
  update: (change: (current: ExplorationSpace) => ExplorationSpace) => boolean;
  toggleFavorite: (ideaId: string) => void;
  toggleSoon: (ideaId: string) => void;
  saveRecord: (record: ExplorationRecord) => boolean;
  removeRecord: (id: string) => void;
  switchOwner: (owner: SpaceOwner) => void;
  notify: (message: string) => void;
  suggestions: ExplorationSuggestion[];
  generating: boolean;
  discoveryNote: string;
  discoveryProgress: string;
  discoveryNeedsLogin: boolean;
  discoveryFailed: boolean;
  reauthenticate: () => void;
  resolveIdea: (id: string | null | undefined) => ExplorationIdea | undefined;
  voteIdea: (ideaId: string, vote: "more" | "less", undo?: boolean) => void;
  cleanupRecommendations: () => void;
  restoreRecommendations: () => void;
  cleanupBackupAvailable: boolean;
  generate: (filters: ExplorationFilters) => Promise<void>;
  prepare: (filters: ExplorationFilters) => void;
  signOut: () => Promise<void>;
};
const ExplorationContext = createContext<ExplorationContextValue | null>(null);
export function useExploration() {
  const value = useContext(ExplorationContext);
  if (!value) throw new Error("Exploration pages require ExplorationApp");
  return value;
}
const navigation = [
  { href: "/", label: "首页", icon: Home },
  { href: "/explore", label: "探索", icon: Compass },
  { href: "/favorites", label: "收藏", icon: Bookmark },
  { href: "/records", label: "记录", icon: NotebookPen },
  { href: "/me", label: "我的", icon: UserRound },
];

function SpaceShell({
  owner,
  allowedUsers,
  authenticated,
  switchOwner,
  signOut,
  reauthenticate,
  children,
}: {
  owner: SpaceOwner;
  allowedUsers: SpaceOwner[];
  authenticated: boolean;
  switchOwner: (owner: SpaceOwner) => void;
  signOut: () => Promise<void>;
  reauthenticate: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [space, setSpace] = useState(() => createEmptySpace(owner));
  const current = useRef(space);
  const statusRef = useRef<SaveStatus>("loading");
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [message, setMessage] = useState("");
  const [removed, setRemoved] = useState<ExplorationRecord | null>(null);
  const [suggestions, setSuggestions] = useState<ExplorationSuggestion[]>([]);
  const displayed = useRef<ExplorationSuggestion[]>([]);
  const requestedFilters = useRef<ExplorationFilters | null>(null);
  const preparedFilters = useRef<ExplorationFilters | null>(null);
  const awaitingGroup = useRef(false);
  const [cleanupBackupAvailable, setCleanupBackupAvailable] = useState(false);
  const previousIdeas = useRef<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [discoveryNote, setDiscoveryNote] = useState("");
  const [discoveryProgress, setDiscoveryProgress] = useState("");
  const [discoveryNeedsLogin, setDiscoveryNeedsLogin] = useState(false);
  const [discoveryFailed, setDiscoveryFailed] = useState(false);
  const [discoveryBuffer] = useState(() => new DiscoveryBuffer());
  const [discoveryReserve] = useState(() => new DiscoveryReserve());
  const reserveTimer = useRef<number | null>(null);
  const reserveTick = useRef<() => void>(() => {});
  const cancelReserve = useCallback(() => {
    if (reserveTimer.current !== null) window.clearTimeout(reserveTimer.current);
    reserveTimer.current = null;
  }, []);
  const scheduleReserve = useCallback(() => {
    if (reserveTimer.current !== null) return;
    reserveTimer.current = window.setTimeout(() => {
      reserveTimer.current = null;
      reserveTick.current();
    }, reserveIntervalMs);
  }, []);
  const refillTimer = useRef<number | null>(null);
  const cancelRefill = useCallback(() => {
    if (refillTimer.current !== null) window.clearTimeout(refillTimer.current);
    refillTimer.current = null;
  }, []);
  useEffect(() => () => {
    cancelRefill(); cancelReserve(); discoveryBuffer.clear(); discoveryReserve.clear();
  }, [discoveryBuffer, discoveryReserve, cancelRefill, cancelReserve]);
  const apply = useCallback(
    (next: ExplorationSpace, nextStatus: SaveStatus) => {
      if (reserveContext(current.current) !== reserveContext(next) || nextStatus !== "saved") {
        cancelReserve(); discoveryReserve.clear();
      }
      const filters = requestedFilters.current;
      if (filters && discoveryScope(filters, current.current) !== discoveryScope(filters, next)) {
        cancelRefill();
        discoveryBuffer.clear();
        awaitingGroup.current = false;
        setGenerating(false);
        setDiscoveryProgress("");
        setDiscoveryFailed(false);
      }
      current.current = next;
      statusRef.current = nextStatus;
      setSpace(next);
      setStatus(nextStatus);
      const retained = displayed.current.filter(({ idea }) => !isRejectedIdea(idea, next));
      if (retained.length !== displayed.current.length) {
        displayed.current = retained;
        setSuggestions(retained);
      }
    },
    [discoveryBuffer, discoveryReserve, cancelRefill, cancelReserve],
  );
  const load = useCallback(() => {
    try {
      const result = readStoredSpace(window.localStorage, owner);
      if (result.status === "ready" && needsRecommendationCleanup(result.space)) {
        const cleaned = cleanupStoredRecommendations(window.localStorage, result.space);
        apply(cleaned.space, cleaned.status === "saved" ? "saved" : cleaned.status);
        if (cleaned.status === "saved") setMessage("旧推荐已清理，感兴趣、收藏和已有记录都留着。清理前已备份。");
      } else apply(result.space, result.status === "ready" ? "saved" : result.status);
      setCleanupBackupAvailable(Boolean(readRecommendationBackup(window.localStorage, owner)));
    } catch {
      apply(current.current, "unavailable");
    }
  }, [apply, owner]);
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== explorationStorageKey(owner) && event.key !== null)
        return;
      try {
        const next = readStoredSpace(window.localStorage, owner);
        if (next.status !== "ready") {
          apply(current.current, next.status);
          return;
        }
        if (next.space.revision < current.current.revision) {
          apply(current.current, "conflict");
          return;
        }
        apply(next.space, "saved");
        setMessage("空间内容已从另一页更新。");
      } catch {
        apply(current.current, "unavailable");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [apply, load, owner]);
  useEffect(() => {
    if (!message || removed) return;
    const timer = window.setTimeout(() => setMessage(""), 4500);
    return () => window.clearTimeout(timer);
  }, [message, removed]);
  const update = useCallback(
    (change: (value: ExplorationSpace) => ExplorationSpace) => {
      if (statusRef.current === "loading" || statusRef.current === "invalid")
        return false;
      try {
        const result = saveStoredSpace(
          window.localStorage,
          current.current,
          change(current.current),
        );
        if (result.status === "saved") {
          apply(result.space, "saved");
          return true;
        }
        if (result.status === "conflict") {
          apply(result.space, "conflict");
          setMessage(
            "另一页已经更新，请再试一次。刚才的操作没有覆盖已有内容。",
          );
        } else {
          apply(current.current, result.status);
        }
      } catch {
        apply(current.current, "unavailable");
      }
      return false;
    },
    [apply],
  );
  const withIdeaSnapshot = (next: ExplorationSpace, ideaId: string | null) => {
    const idea = current.current.discoveredIdeas.find((item) => item.id === ideaId)
      ?? displayed.current.find((item) => item.idea.id === ideaId)?.idea;
    return idea?.discoveredAt
      ? { ...next, discoveredIdeas: mergeDiscoveredIdeas(next, [idea]) }
      : next;
  };
  const present = useCallback((next: ExplorationSuggestion[], result: ReturnType<DiscoveryBuffer["peek"]>) => {
    const added = next.filter(({ idea }) => !displayed.current.some((old) => old.idea.id === idea.id));
    const known = knownSpaceIdeas(current.current);
    const recent = current.current.shownIdeaIds.slice(-60).flatMap((id) => known.get(id) ?? []);
    displayed.current = next;
    setSuggestions(next);
    previousIdeas.current = next.map(({ idea }) => idea.id);
    setDiscoveryNote(!next.length ? ""
      : next.length > added.length ? added.length ? `已补充 ${added.length} 个新建议。` : ""
        : discoveryNoteFor({ ...result, issue: undefined }, next, current.current.shownIdeaIds, recent));
    if (added.length) update((value) => ({ ...value,
      shownIdeaIds: rememberShown(value.shownIdeaIds, added.map(({ idea }) => idea.id)),
      shownWorkKeys: workHistory(value, added.map(({ idea }) => idea)) }));
  }, [update]);
  const prepareReserve = useCallback(() => {
    if (statusRef.current !== "saved" || needsRecommendationCleanup(current.current) || document.hidden) return;
    if (discoveryBuffer.preparing) { scheduleReserve(); return; }
    const filters = preparedFilters.current ?? withExplorationAxes(current.current.preferences);
    const context = reserveContext(current.current);
    const started = discoveryReserve.prepare(filters, current.current, (result) => {
      if (context !== reserveContext(current.current) || statusRef.current !== "saved") return;
      const accepted = result.ideas.filter((idea) => !isRejectedIdea(idea, current.current));
      if (!accepted.length || !update((value) => ({ ...value, discoveredIdeas: mergeDiscoveredIdeas(value, accepted) }))) return;
      const requested = requestedFilters.current;
      if (requested && (awaitingGroup.current || displayed.current.length < 3)) {
        const next = awaitingGroup.current
          ? selectDiscoveredSuggestions(requested, current.current, [], previousIdeas.current)
          : fillMissingSuggestions(requested, current.current, displayed.current, []);
        if (next.length === 3) {
          awaitingGroup.current = false;
          present(next, { ideas: accepted, provider: result.provider });
          setGenerating(false); setDiscoveryFailed(false); setDiscoveryProgress("");
        }
      }
    }, scheduleReserve);
    if (!started && !discoveryReserve.preparing && !discoveryReserve.stopped &&
      displayed.current.length < 3 && requestedFilters.current) {
      const ready = discoveryBuffer.available(requestedFilters.current, current.current);
      setDiscoveryProgress(`已准备 ${Math.min(3, ready)}/3，本轮尚未凑齐，请重试。`);
    }
  }, [discoveryBuffer, discoveryReserve, scheduleReserve, update, present]);
  useEffect(() => { reserveTick.current = prepareReserve; }, [prepareReserve]);
  useEffect(() => {
    const resume = () => { if (!document.hidden) scheduleReserve(); };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, [scheduleReserve]);
  const toggleFavorite = (ideaId: string) => {
    const exists = current.current.favorites.some(
      (item) => item.ideaId === ideaId,
    );
    if (
      update((value) => withIdeaSnapshot({
        ...value,
        favorites: exists
          ? value.favorites.filter((item) => item.ideaId !== ideaId)
          : [
              { ideaId, soon: false, addedAt: new Date().toISOString() },
              ...value.favorites,
            ],
      }, ideaId))
    ) {
      setMessage(
        exists ? "已从收藏里移开。" : "已放进收藏，后续不再推荐这条，可以去收藏夹看。",
      );
      if (!exists && requestedFilters.current) {
        const filters = requestedFilters.current;
        present(fillMissingSuggestions(filters, current.current, displayed.current, []), { ideas: [], provider: "none" });
        prepareNext(filters);
      }
    }
  };
  const prepareNext = useCallback(function prepare(filters: ExplorationFilters, refill = false) {
    cancelRefill();
    cancelReserve(); discoveryReserve.pause();
    preparedFilters.current = filters;
    const scope = discoveryScope(filters, current.current);
    const started = discoveryBuffer.prepare(filters, current.current, (result) => {
      if (scope !== discoveryScope(filters, current.current)) return;
      const accepted = result.ideas.filter((idea) => !isRejectedIdea(idea, current.current));
      update((value) => ({ ...value, discoveredIdeas: mergeDiscoveredIdeas(value, accepted) }));
      if (requestedFilters.current && scope === discoveryScope(requestedFilters.current, current.current)) {
        if (awaitingGroup.current) {
          const next = selectDiscoveredSuggestions(filters, current.current, result.ideas, previousIdeas.current);
          if (next.length === 3) { awaitingGroup.current = false; present(next, result); }
        } else if (displayed.current.length < 3) {
          const next = fillMissingSuggestions(filters, current.current, displayed.current, accepted);
          if (next.length === 3) present(next, result);
        }
      }
      const ready = discoveryBuffer.available(filters, current.current);
      setDiscoveryNeedsLogin(result.issue === "login_required");
      const issue = result.issue ? discoveryNoteFor(result, []) : "";
      setDiscoveryProgress(`${issue}${ready >= 3 ? "下一组已准备好。" : displayed.current.length < 3 ? `正在准备：${Math.min(3, ready)}/3` : "正在准备下一组…"}`);
      if (ready >= 3 || (displayed.current.length === 3 && !awaitingGroup.current)) setGenerating(false);
    }, () => {
      if (scope !== discoveryScope(filters, current.current)) return;
      const ready = discoveryBuffer.available(filters, current.current);
      const result = discoveryBuffer.peek(filters, current.current);
      discoveryReserve.stopOnFailure(result, current.current);
      if (discoveryBuffer.canRefill(filters, current.current)) {
        setGenerating(displayed.current.length < 3 || awaitingGroup.current);
        const recovering = canRetryDiscovery(result);
        setDiscoveryProgress(recovering ? `${discoveryNoteFor(result, [])}正在重试…`
          : ready >= 3 ? "正在准备下一组…" : `正在准备：${Math.min(3, ready)}/3`);
        refillTimer.current = window.setTimeout(() => {
          refillTimer.current = null;
          if (preparedFilters.current && scope === discoveryScope(preparedFilters.current, current.current)) prepare(filters, true);
        }, recovering ? 600 : 0);
        return;
      }
      setGenerating(false);
      scheduleReserve();
      const failed = ready < 3 && isDiscoveryFailure(result);
      setDiscoveryFailed(failed);
      if (ready < 3) {
        if (awaitingGroup.current) setDiscoveryNote(failed
          ? displayed.current.length === 3 ? "换组失败，当前选择已保留。" : "推荐未完成。"
          : displayed.current.length === 3 ? "下一组尚未备齐。" : "");
        setDiscoveryProgress(failed ? `${discoveryNoteFor(result, [])}请重试。`
          : `已准备 ${Math.min(3, ready)}/3，后台继续补充。`);
      } else {
        setDiscoveryProgress("下一组已准备好。");
      }
    }, refill);
    if (started) {
      const ready = discoveryBuffer.available(filters, current.current);
      setGenerating(ready < 3 && (displayed.current.length < 3 || awaitingGroup.current));
      setDiscoveryFailed(false);
      setDiscoveryNeedsLogin(false);
      setDiscoveryProgress(ready >= 3 ? "下一组已准备好。"
        : displayed.current.length < 3 ? `正在准备：${ready}/3` : "正在准备下一组…");
    } else if (discoveryBuffer.available(filters, current.current) >= 3) {
      setGenerating(false);
      setDiscoveryFailed(false);
      setDiscoveryProgress("下一组已准备好。");
      scheduleReserve();
    } else if (discoveryBuffer.preparing) {
      setGenerating(displayed.current.length < 3 || awaitingGroup.current);
      setDiscoveryFailed(false);
      setDiscoveryProgress(displayed.current.length < 3 ? "正在准备三个选择…" : "正在准备下一组…");
    } else {
      setGenerating(false);
      const result = discoveryBuffer.peek(filters, current.current);
      setDiscoveryFailed(isDiscoveryFailure(result));
      setDiscoveryNeedsLogin(result.issue === "login_required");
      setDiscoveryProgress(result.issue ? discoveryNoteFor(result, []) : "正在后台补充。");
      scheduleReserve();
    }
  }, [discoveryBuffer, discoveryReserve, update, present, cancelRefill, cancelReserve, scheduleReserve]);
  const prepare = useCallback((filters: ExplorationFilters) => {
    if (statusRef.current !== "saved" || needsRecommendationCleanup(current.current)) return;
    if (awaitingGroup.current && discoveryBuffer.preparing && requestedFilters.current &&
      discoveryScope(filters, current.current) !== discoveryScope(requestedFilters.current, current.current)) return;
    prepareNext(filters);
  }, [prepareNext, discoveryBuffer]);
  useEffect(() => {
    if (pathname !== "/" || status !== "saved") return;
    const timer = window.setTimeout(() => prepare(withExplorationAxes(current.current.preferences)), 300);
    return () => window.clearTimeout(timer);
  }, [pathname, status, prepare]);
  const generate = useCallback(
    async (input: ExplorationFilters) => {
      // Callers may pass a full preference object; persist only recommendation
      // fields so an old draft cannot restore an earlier color or profile.
      const filters = normalizeFilters(input);
      if (needsRecommendationCleanup(current.current)) {
        setDiscoveryNote("旧推荐清理前的备份尚未保存成功。");
        setDiscoveryProgress("请先重新读取空间；备份成功后再寻找新内容。");
        return;
      }
      const prepared = discoveryBuffer.peek(filters, current.current);
      const immediate = selectDiscoveredSuggestions(filters, current.current, prepared.ideas, previousIdeas.current);
      if (immediate.length < 3) discoveryReserve.retry();
      const keepCurrent = displayed.current.length === 3 && requestedFilters.current &&
        discoveryScope(filters, current.current) === discoveryScope(requestedFilters.current, current.current);
      requestedFilters.current = filters;
      update((value) => ({
        ...value,
        preferences: { ...value.preferences, ...filters },
      }));
      awaitingGroup.current = freshOnly(current.current) && immediate.length < 3;
      if (awaitingGroup.current && keepCurrent) {
        setDiscoveryNote("下一组正在准备，当前选择已保留。");
      } else present(awaitingGroup.current ? [] : immediate, prepared);
      prepareNext(filters);
    },
    [discoveryBuffer, discoveryReserve, update, prepareNext, present],
  );
  const voteIdea = (ideaId: string, vote: "more" | "less", undo = false) => {
    const existing = current.current.feedback?.find((item) => item.ideaId === ideaId);
    if (!undo && existing?.vote === vote) return;
    if (undo && existing?.vote !== vote) return;
    if (!existing && (current.current.feedback?.length ?? 0) >= maxFeedback) {
      setMessage("反馈保存空间已满，请先在“我的”撤销不需要的反馈；已有排除仍有效。"); return;
    }
    const original = displayed.current.find(({ idea }) => idea.id === ideaId)?.idea ?? knownSpaceIdeas(current.current).get(ideaId);
    if (!update((value) => {
      const next = withIdeaSnapshot({ ...value,
        feedback: [...(!undo ? [{ ideaId, vote, updatedAt: new Date().toISOString() }] : []),
          ...(value.feedback ?? []).filter((item) => item.ideaId !== ideaId)] }, ideaId);
      const evidence = (next.suppressedIdeas ?? []).filter((item) => item.id !== ideaId || item.reason === "cleanup");
      if (!undo && vote === "less" && original && !evidence.some((item) => item.id === ideaId)) evidence.push(suppressionFor(original, "dislike"));
      const updated = { ...next, suppressedIdeas: evidence };
      const pinned = preserveSnapshotIds(updated);
      return { ...updated, discoveredIdeas: updated.discoveredIdeas.filter((idea) => pinned.has(idea.id) || !isRejectedIdea(idea, updated)) };
    })) return;
    discoveryBuffer.clear();
    setGenerating(false);
    setDiscoveryProgress(undo ? "已撤销反馈，后续推荐会重新调整。" : "反馈已记住，正在准备更合适的新选择。");
    if (!undo && vote === "less" && requestedFilters.current) {
      const next = fillMissingSuggestions(requestedFilters.current, current.current, displayed.current, []);
      present(next, { ideas: [], provider: "none" });
    }
    prepareNext(current.current.preferences);
    setMessage(undo ? "已撤销反馈。" : vote === "more" ? "已标记感兴趣。" : "已排除此活动。");
  };
  const cleanupRecommendations = () => {
    const result = cleanupStoredRecommendations(window.localStorage, current.current);
    if (result.status !== "saved") { setMessage("这次没有清理成功，原内容仍保留。请刷新后再试。"); return; }
    discoveryBuffer.clear();
    apply(result.space, "saved");
    setCleanupBackupAvailable(true);
    present([], { ideas: [], provider: "none" });
    setMessage("旧推荐已清理，感兴趣、收藏和已有记录都留着。清理前已备份。");
    if (requestedFilters.current) prepareNext(requestedFilters.current);
  };
  const restoreRecommendations = () => {
    const backup = readRecommendationBackup(window.localStorage, owner);
    if (!backup || !update((value) => restoreRecommendationCache(value, backup))) return;
    discoveryBuffer.clear();
    setMessage("已恢复清理前的候选；之后新增的记录、收藏、反馈和配色保留。");
  };
  const toggleSoon = (ideaId: string) => {
    update((value) => ({
      ...value,
      favorites: value.favorites.map((item) =>
        item.ideaId === ideaId ? { ...item, soon: !item.soon } : item,
      ),
    }));
  };
  const saveRecord = (record: ExplorationRecord) =>
    update((value) => withIdeaSnapshot({
      ...value,
      records: [
        record,
        ...value.records.filter((item) => item.id !== record.id),
      ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    }, record.ideaId));
  const removeRecord = (id: string) => {
    const existing = current.current.records.find((item) => item.id === id);
    if (
      existing &&
      update((value) => ({
        ...value,
        records: value.records.filter((item) => item.id !== id),
      }))
    ) {
      setRemoved(existing);
      setMessage("这条记录已移开。");
    }
  };
  const tone = spaceTone(space.preferences);
  const chooseTone = (color: string) => {
    if (!isTone(color)) return;
    update((value) => ({
      ...value,
      preferences: withSpaceTone(value.preferences, color),
    }));
  };
  const resetTone = () =>
    update((value) => ({ ...value, preferences: resetSpaceTone(value.preferences) }));
  return (
    <ExplorationContext.Provider
      value={{
        space,
        owner,
        allowedUsers,
        authenticated,
        status,
        update,
        toggleFavorite,
        toggleSoon,
        saveRecord,
        removeRecord,
        switchOwner,
        notify: setMessage,
        suggestions,
        generating,
        discoveryNote,
        discoveryProgress,
        discoveryFailed,
        discoveryNeedsLogin,
        reauthenticate,
        voteIdea,
        cleanupRecommendations,
        restoreRecommendations,
        cleanupBackupAvailable,
        resolveIdea: (id) => findIdea(id) ?? space.discoveredIdeas.find((idea) => idea.id === id) ?? suggestions.find((item) => item.idea.id === id)?.idea,
        generate,
        prepare,
        signOut,
      }}
    >
      <div
        className="exploration-app"
        style={
          {
            "--e-tone": tone,
            "--e-primary": readableTone(tone),
          } as CSSProperties
        }
      >
        <a className="exploration-skip" href="#exploration-content">
          跳到内容
        </a>
        <header className="exploration-header">
          <Link
            href="/"
            className="exploration-brand"
            aria-label="漫游首页"
          >
            <span className="exploration-brand-mark">
              <Compass size={23} strokeWidth={1.35} aria-hidden="true" />
            </span>
            <span>
              <strong>漫游</strong>
            </span>
          </Link>
          <nav className="exploration-nav" aria-label="主要导航">
            {navigation.map(({ href, label, icon: Icon }) => {
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={active ? "active" : ""}
                >
                  <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="exploration-header-tools">
            <PageColorPicker
              key={`${owner}:${pathname}`}
              color={tone}
              choose={chooseTone}
              reset={resetTone}
              custom={tone !== defaultTone}
            />
            <Link
              href="/me"
              className="exploration-avatar"
              aria-label={`我的空间：${owner === "serenity" ? "Serenity" : "zzz"}`}
            >
              {owner === "serenity" ? "S" : "Z"}
            </Link>
          </div>
        </header>
        <main id="exploration-content" className="exploration-content">
          {status === "invalid" ||
          status === "unavailable" ||
          status === "conflict" ? (
            <div className="exploration-storage-note" role="alert">
              <span>
                {status === "invalid"
                  ? "暂时无法读取这份收藏和记录，原内容仍保留着。"
                  : status === "unavailable"
                    ? "浏览器暂时无法保存，刚才的操作还没有存下。"
                    : "另一页的内容有更新，请确认后再继续。"}
              </span>
              <button type="button" onClick={load}>
                重新读取
              </button>
            </div>
          ) : null}
          {status === "loading" ? (
            <div className="exploration-loading" role="status">
              <Compass size={28} strokeWidth={1.2} />
              <p>正在读取…</p>
            </div>
          ) : (
            children
          )}
        </main>
        {message ? (
          <div className="exploration-toast" role="status">
            <span>{message}</span>
            {removed ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (saveRecord(removed)) {
                      setRemoved(null);
                      setMessage("记录已放回。");
                    }
                  }}
                >
                  撤销
                </button>
                <button
                  type="button"
                  aria-label="关闭提示"
                  onClick={() => {
                    setRemoved(null);
                    setMessage("");
                  }}
                >
                  ×
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </ExplorationContext.Provider>
  );
}

export function ExplorationApp({ children }: { children: ReactNode }) {
  const requireAuth = process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";
  const [viewer, setViewer] = useState<SpaceOwner | null>(
    requireAuth ? null : "serenity",
  );
  const [owner, setOwner] = useState<SpaceOwner>("serenity");
  const [checked, setChecked] = useState(!requireAuth);
  useEffect(() => {
    const controller = new AbortController();
    const restoreOwner = (user: SpaceOwner) => {
      let remembered: string | null = null;
      try {
        remembered = window.sessionStorage.getItem(
          "free-exploration:active-space",
        );
      } catch {
        /* Optional preference. */
      }
      return user === "serenity" && remembered === "zzz" ? "zzz" : user;
    };
    if (!requireAuth) {
      const timer = window.setTimeout(
        () => setOwner(restoreOwner("serenity")),
        0,
      );
      return () => window.clearTimeout(timer);
    }
    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then(
        (payload: {
          authenticated?: boolean;
          user?: { id?: SpaceOwner } | null;
        }) => {
          if (controller.signal.aborted) return;
          const user = payload.user?.id;
          if (
            payload.authenticated &&
            (user === "serenity" || user === "zzz")
          ) {
            setViewer(user);
            setOwner(restoreOwner(user));
          }
        },
      )
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setChecked(true);
      });
    return () => controller.abort();
  }, [requireAuth]);
  if (!checked)
    return (
      <div className="exploration-app">
        <div className="exploration-loading" role="status">
          正在打开你的空间…
        </div>
      </div>
    );
  if (!viewer)
    return (
      <LoginView
        onAuthenticated={(user) => {
          setViewer(user);
          setOwner(user);
        }}
      />
    );
  const allowedUsers: SpaceOwner[] =
    viewer === "serenity" ? ["serenity", "zzz"] : ["zzz"];
  const switchOwner = (user: SpaceOwner) => {
    if (!allowedUsers.includes(user)) return;
    try {
      window.sessionStorage.setItem("free-exploration:active-space", user);
    } catch {
      /* Optional preference. */
    }
    setOwner(user);
  };
  const signOut = async () => {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("LOGOUT_FAILED");
    setViewer(null);
    setOwner("serenity");
  };
  return (
    <SpaceShell
      key={owner}
      owner={owner}
      allowedUsers={allowedUsers}
      authenticated={requireAuth}
      switchOwner={switchOwner}
      signOut={signOut}
      reauthenticate={() => setViewer(null)}
    >
      {children}
    </SpaceShell>
  );
}
