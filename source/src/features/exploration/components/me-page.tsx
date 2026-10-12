"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { explorationStorageKey, mergeSpaces, parseSpace } from "../storage";
import type { SpaceOwner } from "../types";
import { useExploration } from "./exploration-app";
import { AppearanceSettings } from "./page-color-picker";
import { DiscoveryPreferences } from "./discovery-preferences";

export function MePage() {
  const {
    space,
    owner,
    allowedUsers,
    authenticated,
    update,
    switchOwner,
    notify,
    status,
    signOut,
  } = useExploration();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const exportSpace = () => {
    setError("");
    try {
      const raw =
        status === "invalid"
          ? window.localStorage.getItem(explorationStorageKey(owner))
          : null;
      const url = URL.createObjectURL(
        new Blob([raw ?? JSON.stringify(space, null, 2)], {
          type: "application/json",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `漫游-${owner}-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("已导出一份收藏和记录，可以自己保管。");
    } catch {
      setError("这次没有导出成功，请再试一次。");
    }
  };
  const importSpace = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("这份文件太大，请选择之前导出的探索备份。");
      return;
    }
    try {
      const imported = parseSpace(JSON.parse(await file.text()), owner);
      if (!imported) {
        setError("请选择当前账号之前导出的探索备份。原有收藏和记录没有变化。");
        return;
      }
      if (update((current) => mergeSpaces(current, imported)))
        notify("备份里的内容已经放回，原有的感受也留着。");
    } catch {
      setError("这份文件暂时无法读取，原有收藏和记录没有变化。");
    }
  };
  const leaveSpace = async () => {
    setSigningOut(true);
    setError("");
    try {
      await signOut();
      router.replace("/");
      router.refresh();
    } catch {
      setError("暂时没有退出成功，请稍后再试。");
      setSigningOut(false);
    }
  };
  return (
    <div className="exploration-page exploration-me">
      <header className="exploration-page-heading">
        <h1>我的</h1>
      </header>
      <section className="exploration-setting">
        <div>
          <h2>我的空间</h2>
          <p>
            {authenticated ? "已登录" : "本机预览"}
          </p>
        </div>
        <label className="exploration-space-select">
          <span className="exploration-sr-only">选择空间</span>
          <select
            value={owner}
            onChange={(event) => switchOwner(event.target.value as SpaceOwner)}
          >
            {allowedUsers.map((user) => (
              <option value={user} key={user}>
                {user === "serenity" ? "Serenity" : "zzz"}
              </option>
            ))}
          </select>
        </label>
      </section>
      <AppearanceSettings />
      <DiscoveryPreferences />
      <section className="exploration-setting exploration-setting-wrap">
        <div>
          <h2>数据备份</h2>
          <p>
            数据保存在当前浏览器，尚未自动同步到其他设备。
          </p>
        </div>
        <div className="exploration-backup-actions">
          <button
            className="exploration-secondary"
            type="button"
            onClick={exportSpace}
          >
            <Download size={16} />
            导出备份
          </button>
          <button
            className="exploration-secondary"
            type="button"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={16} />
            导入备份
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="选择探索备份文件"
            onChange={importSpace}
          />
        </div>
      </section>
      <section className="exploration-setting">
        <div>
          <h2>北京去哪儿玩</h2>
        </div>
        <Link
          className="exploration-text-link"
          href={`/beijing?space=${owner}`}
        >
          去北京模块 <ArrowUpRight size={16} />
        </Link>
      </section>
      {error ? (
        <p className="exploration-form-error" role="alert">
          {error}
        </p>
      ) : null}
      {authenticated ? (
        <button
          className="exploration-text-link exploration-sign-out"
          type="button"
          onClick={leaveSpace}
          disabled={signingOut}
        >
          {signingOut ? "正在退出…" : "退出登录"}
        </button>
      ) : null}
    </div>
  );
}
