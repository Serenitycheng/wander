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
import { appearancePage, isTone, pageTone, readableTone } from "../appearance";
import { PageColorPicker } from "./page-color-picker";
import { LoginView } from "@/components/auth/space-login";
import { generateSuggestions } from "../generator";
import {
  createEmptySpace,
  readStoredSpace,
  saveStoredSpace,
  explorationStorageKey,
} from "../storage";
import type {
  ExplorationFilters,
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
  generate: (filters: ExplorationFilters) => void;
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
  children,
}: {
  owner: SpaceOwner;
  allowedUsers: SpaceOwner[];
  authenticated: boolean;
  switchOwner: (owner: SpaceOwner) => void;
  signOut: () => Promise<void>;
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
  const previousIdeas = useRef<string[]>([]);
  const apply = useCallback(
    (next: ExplorationSpace, nextStatus: SaveStatus) => {
      current.current = next;
      statusRef.current = nextStatus;
      setSpace(next);
      setStatus(nextStatus);
    },
    [],
  );
  const load = useCallback(() => {
    try {
      const result = readStoredSpace(window.localStorage, owner);
      apply(result.space, result.status === "ready" ? "saved" : result.status);
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
  const toggleFavorite = (ideaId: string) => {
    const exists = current.current.favorites.some(
      (item) => item.ideaId === ideaId,
    );
    if (
      update((value) => ({
        ...value,
        favorites: exists
          ? value.favorites.filter((item) => item.ideaId !== ideaId)
          : [
              { ideaId, soon: false, addedAt: new Date().toISOString() },
              ...value.favorites,
            ],
      }))
    )
      setMessage(
        exists ? "已从收藏里移开。" : "已放进收藏，什么时候想试都可以。",
      );
  };
  const generate = useCallback(
    (filters: ExplorationFilters) => {
      const next = generateSuggestions(filters, {
        previousIds: previousIdeas.current,
        recentIds: current.current.records
          .slice(0, 8)
          .flatMap((item) => (item.ideaId ? [item.ideaId] : [])),
      });
      previousIdeas.current = next.map((item) => item.idea.id);
      setSuggestions(next);
      update((value) => ({
        ...value,
        preferences: { ...value.preferences, ...filters },
      }));
    },
    [update],
  );
  const toggleSoon = (ideaId: string) => {
    update((value) => ({
      ...value,
      favorites: value.favorites.map((item) =>
        item.ideaId === ideaId ? { ...item, soon: !item.soon } : item,
      ),
    }));
  };
  const saveRecord = (record: ExplorationRecord) =>
    update((value) => ({
      ...value,
      records: [
        record,
        ...value.records.filter((item) => item.id !== record.id),
      ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    }));
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
  const page = appearancePage(pathname);
  const tone = pageTone(space.preferences, page);
  const chooseTone = (color: string) => {
    if (!isTone(color)) return;
    update((value) => ({
      ...value,
      preferences: {
        ...value.preferences,
        pageColors: {
          ...value.preferences.pageColors,
          [page]: color.toLowerCase(),
        },
      },
    }));
  };
  const resetTone = () =>
    update((value) => {
      const pageColors = { ...value.preferences.pageColors };
      delete pageColors[page];
      return { ...value, preferences: { ...value.preferences, pageColors } };
    });
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
        generate,
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
              <small>给日常一点新的可能</small>
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
              key={`${owner}:${page}`}
              page={page}
              color={tone}
              choose={chooseTone}
              reset={resetTone}
              custom={Boolean(space.preferences.pageColors?.[page])}
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
              <p>给新的可能留一点空白…</p>
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
    >
      {children}
    </SpaceShell>
  );
}
