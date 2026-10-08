"use client";

import Image from "next/image";
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import type { UserId } from "@/lib/types";

type LoginViewProps = { onAuthenticated: (user: UserId) => void };

export function LoginView({ onAuthenticated }: LoginViewProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const payload = await response.json() as { user?: { id?: UserId }; error?: string };
      if (!response.ok || !payload.user?.id) setError(payload.error || "登录失败，请稍后再试");
      else onAuthenticated(payload.user.id);
    } catch {
      setError("暂时无法连接网站，请稍后再试");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-form-panel">
          <div className="brand"><span className="brand-mark">北</span><span><strong>北京去哪儿玩</strong><small>私人周末决策系统</small></span></div>
          <div className="login-copy"><span className="status-pill"><ShieldCheck size={15} /> 独立账号空间</span><h1>回来继续决定周末。</h1><p>第一版仅开放 Serenity 与 zzz。两人的空间独立保存；管理员可查看成员空间，成员不能进入管理员空间。</p></div>
          <form onSubmit={submit} className="login-form">
            <label><span>账号</span><div><KeyRound size={17} /><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Serenity 或 zzz" /></div></label>
            <label><span>密码</span><div><LockKeyhole size={17} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="请输入密码" /></div></label>
            {error ? <p className="login-error" role="alert">{error}</p> : null}
            <button className="primary-button" disabled={pending} type="submit">{pending ? "正在登录…" : "进入我的空间"}<ArrowRight size={18} /></button>
          </form>
          <small className="login-footnote">密码只在服务端验证，源码中不会保存明文。</small>
        </div>
        <div className="login-art"><Image src="/hero-weekend.png" alt="北京周末活动选择插画" fill priority sizes="(max-width: 760px) 100vw, 50vw" /><div><span>v1.0.0</span><strong>先把这周末选出来。</strong></div></div>
      </section>
    </main>
  );
}
