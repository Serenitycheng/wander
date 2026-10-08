"use client";

import { ArrowRight, Compass } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { SpaceOwner } from "@/features/exploration/types";

export function LoginView({
  onAuthenticated,
}: {
  onAuthenticated: (user: SpaceOwner) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as {
        user?: { id?: SpaceOwner };
        error?: string;
      };
      if (!response.ok || !payload.user?.id)
        setError(payload.error || "暂时没有登录成功，再试一次吧。");
      else onAuthenticated(payload.user.id);
    } catch {
      setError("暂时无法连接，请稍后再试。");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="exploration-app">
      <main className="exploration-login">
        <div className="exploration-brand">
          <span className="exploration-brand-mark">
            <Compass size={24} strokeWidth={1.4} />
          </span>
          <span>
            <strong>漫游</strong>
            <small>给日常一点新的可能</small>
          </span>
        </div>
        <span className="exploration-eyebrow">回来，继续随便看看</span>
        <h1>
          新的可能，
          <br />
          从这里开始。
        </h1>
        <p>登录自己的空间，放一些想试的事，留几句探索后的感受。</p>
        <form onSubmit={submit}>
          <label>
            账号
            <input
              required
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Serenity 或 zzz"
            />
          </label>
          <label>
            密码
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
          </label>
          {error ? (
            <p className="exploration-form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="exploration-primary"
            disabled={pending}
            type="submit"
          >
            {pending ? "正在打开…" : "进入我的空间"}
            <ArrowRight size={17} />
          </button>
        </form>
        <small>Serenity 与 zzz 的独立空间 · 沿用原来的账号</small>
      </main>
    </div>
  );
}
