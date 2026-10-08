import {
  CalendarDays,
  ChevronDown,
  Compass,
  History,
  LibraryBig,
  Route,
} from "lucide-react";
import type { ReactNode } from "react";
import type { UserId, ViewName } from "@/lib/types";

const navItems: Array<{ label: string; view: ViewName; icon: typeof Compass }> = [
  { label: "开始决定", view: "dashboard", icon: Compass },
  { label: "活动库", view: "library", icon: LibraryBig },
  { label: "本周发生", view: "week", icon: CalendarDays },
  { label: "历史出行", view: "history", icon: History },
];

type AppFrameProps = {
  children: ReactNode;
  view: ViewName;
  onNavigate: (view: ViewName) => void;
  theme: "sage" | "lavender";
  onThemeChange: (theme: "sage" | "lavender") => void;
  activeUser: UserId;
  onUserChange: (user: UserId) => void;
  allowedUsers: UserId[];
  saveState: "saved" | "saving" | "conflict" | "error";
  cloudEnabled: boolean;
};

export function AppFrame({
  children,
  view,
  onNavigate,
  theme,
  onThemeChange,
  activeUser,
  onUserChange,
  allowedUsers,
  saveState,
  cloudEnabled,
}: AppFrameProps) {
  const userLabel = activeUser === "serenity" ? "Serenity" : "zzz";

  return (
    <main className={`app-shell theme-${theme}`}>
      <aside className="sidebar" aria-label="主要导航">
        <button className="brand brand-button" type="button" onClick={() => onNavigate("dashboard")}>
          <span className="brand-mark">北</span>
          <span>
            <strong>北京去哪儿玩</strong>
            <small>私人周末决策系统</small>
          </span>
        </button>

        <nav className="side-nav">
          {navItems.map(({ label, view: itemView, icon: Icon }) => (
            <button
              className={view === itemView ? "nav-item active" : "nav-item"}
              key={label}
              type="button"
              onClick={() => onNavigate(itemView)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-callout">
          <Route size={17} aria-hidden="true" />
          <div>
            <strong>路线纵向展开</strong>
            <span>出发地 → 汇合点 → 活动 → 返程</span>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className={`sync-dot ${saveState}`} />
          <span>{saveState === "saving" ? cloudEnabled ? "正在保存到云端" : "正在自动保存" : saveState === "conflict" ? "检测到覆盖冲突" : saveState === "error" ? "云同步暂时失败" : cloudEnabled ? "云端已同步" : "本机预览已保存"}</span>
          <small>v1.3.0</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">北京 · 周末决策工作台</p>
            <h1>{view === "dashboard" ? "周末还没想好？" : navItems.find((item) => item.view === view)?.label ?? "本次出行"}</h1>
          </div>
          <div className="topbar-actions">
            <div className="theme-switch" aria-label="页面颜色">
              <button
                className={theme === "sage" ? "theme-dot sage selected" : "theme-dot sage"}
                onClick={() => onThemeChange("sage")}
                aria-label="使用鼠尾草绿"
                type="button"
              />
              <button
                className={theme === "lavender" ? "theme-dot lavender selected" : "theme-dot lavender"}
                onClick={() => onThemeChange("lavender")}
                aria-label="使用薰衣草紫"
                type="button"
              />
            </div>
            <label className="profile-select">
              <span className="avatar">{activeUser === "serenity" ? "S" : "Z"}</span>
              <select value={activeUser} onChange={(event) => onUserChange(event.target.value as UserId)} aria-label="切换空间">
                {allowedUsers.includes("serenity") ? <option value="serenity">Serenity · 管理员</option> : null}
                {allowedUsers.includes("zzz") ? <option value="zzz">zzz · 成员</option> : null}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </label>
          </div>
        </header>

        {saveState === "conflict" ? (
          <div className="conflict-banner" role="status">
            另一个页面刚刚修改了 {userLabel} 的空间。本页已暂停覆盖，请刷新后选择要保留的数据。
          </div>
        ) : null}

        {children}
      </section>

      <nav className="bottom-nav" aria-label="移动端导航">
        {navItems.map(({ label, view: itemView, icon: Icon }) => (
          <button
            className={view === itemView ? "bottom-item active" : "bottom-item"}
            key={label}
            type="button"
            onClick={() => onNavigate(itemView)}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
