"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, NotebookPen, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { categoryLabels, feelingOptions } from "../types";
import type { ExplorationCategory, ExplorationRecord } from "../types";
import { useExploration } from "./exploration-app";
import { ModeIcon } from "./idea-card";

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function RecordForm({
  initial,
  ideaId,
  onClose,
}: {
  initial?: ExplorationRecord;
  ideaId?: string;
  onClose: () => void;
}) {
  const { saveRecord, notify, resolveIdea } = useExploration();
  const idea = resolveIdea(ideaId);
  const [title, setTitle] = useState(initial?.title ?? idea?.title ?? "");
  const [category, setCategory] = useState<ExplorationCategory>(
    initial?.category ?? idea?.category ?? "home",
  );
  const [feeling, setFeeling] = useState<ExplorationRecord["feeling"]>(
    initial?.feeling ?? "",
  );
  const [reflection, setReflection] = useState(initial?.reflection ?? "");
  const [again, setAgain] = useState<ExplorationRecord["again"]>(
    initial?.again ?? "maybe",
  );
  const [date, setDate] = useState(initial?.date ?? today);
  const [place, setPlace] = useState(initial?.place ?? idea?.place ?? "");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const record: ExplorationRecord = {
      id: initial?.id ?? crypto.randomUUID(),
      ideaId: initial?.ideaId ?? idea?.id ?? null,
      category,
      title: title.trim(),
      feeling,
      reflection: reflection.trim(),
      again,
      date,
      place: place.trim(),
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    };
    if (saveRecord(record)) {
      notify(
        initial
          ? "这段感受已经更新。"
          : "留下了一个片刻。什么时候想继续，都可以。",
      );
      onClose();
    }
  };
  return (
    <form className="exploration-record-form" onSubmit={submit}>
      <div className="exploration-section-heading">
        <h2>{initial ? "再添一点感受" : "留住一个片刻"}</h2>
        <button
          className="exploration-icon-button"
          type="button"
          aria-label="收起记录编辑"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      <label className="exploration-field">
        做了什么
        <input
          autoFocus
          required
          maxLength={160}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="哪怕只是在新路口拐了个弯"
        />
      </label>
      <label className="exploration-field">
        属于哪个方向
        <select
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as ExplorationCategory)
          }
        >
          {Object.entries(categoryLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>
          当时感觉如何？<span>可不填</span>
        </legend>
        <div className="exploration-choice-row">
          {feelingOptions.map((option) => (
            <button
              type="button"
              key={option.id}
              aria-pressed={feeling === option.id}
              className={feeling === option.id ? "selected" : ""}
              onClick={() => setFeeling(feeling === option.id ? "" : option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="exploration-field">
        一句话感受<span>可不填</span>
        <textarea
          rows={3}
          maxLength={600}
          value={reflection}
          onChange={(event) => setReflection(event.target.value)}
          placeholder="喜欢、不喜欢，或者还想继续的地方"
        />
      </label>
      <fieldset>
        <legend>还想继续类似的探索吗？</legend>
        <div className="exploration-choice-row">
          {(
            [
              { id: "yes", label: "还想试试" },
              { id: "maybe", label: "以后再看" },
              { id: "no", label: "这次就好" },
            ] as const
          ).map((option) => (
            <button
              type="button"
              key={option.id}
              aria-pressed={again === option.id}
              className={again === option.id ? "selected" : ""}
              onClick={() => setAgain(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      <details className="exploration-optional-fields">
        <summary>想多留一点：日期和地点</summary>
        <div className="exploration-form-two-col">
          <label className="exploration-field">
            日期
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="exploration-field">
            地点
            <input
              maxLength={160}
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              placeholder="在家、某条街，或留空"
            />
          </label>
        </div>
      </details>
      <div className="exploration-form-actions">
        <button type="submit" className="exploration-primary">
          {initial ? "保存这段感受" : "把这个片刻留下"}
          <ArrowRight size={17} />
        </button>
        <button
          type="button"
          className="exploration-text-link"
          onClick={onClose}
        >
          这次先不记
        </button>
      </div>
    </form>
  );
}

export function RecordsPage({ initialIdeaId }: { initialIdeaId?: string }) {
  const { space, removeRecord, resolveIdea } = useExploration();
  const router = useRouter();
  const [form, setForm] = useState<"new" | ExplorationRecord | null>(() =>
    resolveIdea(initialIdeaId) ? "new" : null,
  );
  const closeForm = () => {
    setForm(null);
    if (initialIdeaId) router.replace("/records");
  };
  return (
    <div className="exploration-page">
      <header className="exploration-page-heading exploration-heading-with-action">
        <div>
          <span className="exploration-eyebrow">留几句生活的回声</span>
          <h1>原来，我也走了这么一小段。</h1>
          <p>记下做过的事和当时的感受，想记的时候再记。</p>
        </div>
        {form === null ? (
          <button
            type="button"
            className="exploration-secondary"
            onClick={() => setForm("new")}
          >
            <Plus size={17} />
            随手记一笔
          </button>
        ) : null}
      </header>
      {form ? (
        <RecordForm
          key={
            typeof form === "string" ? `new-${initialIdeaId ?? ""}` : form.id
          }
          initial={typeof form === "string" ? undefined : form}
          ideaId={initialIdeaId}
          onClose={closeForm}
        />
      ) : null}
      {space.records.length ? (
        <div className="exploration-record-list">
          {space.records.map((item) => (
            <article
              className={`exploration-record-card category-${item.category}`}
              key={item.id}
            >
              <span className="exploration-mode-icon">
                <ModeIcon mode={item.category} />
              </span>
              <div className="exploration-record-body">
                <span className="exploration-duration">
                  {categoryLabels[item.category]}
                  {item.date ? ` · ${item.date.replaceAll("-", ".")}` : ""}
                  {item.place ? ` · ${item.place}` : ""}
                </span>
                <h2>{item.title}</h2>
                {item.reflection ? <p>{item.reflection}</p> : null}
                <div className="exploration-record-feelings">
                  {item.feeling ? (
                    <span>
                      {
                        feelingOptions.find(
                          (option) => option.id === item.feeling,
                        )?.label
                      }
                    </span>
                  ) : null}
                  <span>
                    {item.again === "yes"
                      ? "还想继续类似探索"
                      : item.again === "maybe"
                        ? "以后再看"
                        : "这次就好"}
                  </span>
                </div>
              </div>
              <div className="exploration-record-tools">
                <button
                  className="exploration-icon-button"
                  type="button"
                  aria-label={`编辑记录：${item.title}`}
                  onClick={() => setForm(item)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="exploration-icon-button"
                  type="button"
                  aria-label={`移开记录：${item.title}`}
                  onClick={() => removeRecord(item.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : !form ? (
        <div className="exploration-empty-page">
          <NotebookPen size={35} strokeWidth={1.1} />
          <h2>不写日记，也没有关系。</h2>
          <p>
            哪天想留下一点感受，
            <br />
            一句话就可以是一个片刻。
          </p>
          <Link href="/explore" className="exploration-secondary">
            先去探索 <ArrowRight size={16} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
