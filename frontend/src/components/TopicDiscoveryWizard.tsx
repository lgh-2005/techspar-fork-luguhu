import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, BookOpen, Loader2, Pencil, RefreshCw, Sparkles, Wand2,
} from "lucide-react";
import { getTopicIcon } from "../utils/topicIcons";
import {
  createTopic, generateKnowledge, getProfile, getResumeStatus, suggestTopics,
} from "../api/interview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface TopicCandidate {
  name: string;
  reason?: string;
  evidence?: string;
  icon?: string;
}

interface Signal {
  kind: "resume" | "jd" | "none";
  filename?: string;
  role?: string;
}

interface TopicDiscoveryWizardProps {
  /** 用户改定后创建成功；由页面负责刷新列表并选中新领域 */
  onCreated: (key: string, name: string) => void | Promise<void>;
  /** 允许收起回「手动新建」路径 */
  onCancel?: () => void;
  className?: string;
}

type Phase = "probing" | "intro" | "questions" | "generating" | "candidates" | "creating";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** 生成阶段的分段文案：模型一次调用可能十几秒，给出可见的进展感。 */
const GENERATING_HINTS = [
  "正在读你的材料…",
  "正在归纳可出题的方向…",
  "正在筛掉太宽泛的选项…",
];

export default function TopicDiscoveryWizard({ onCreated, onCancel, className }: TopicDiscoveryWizardProps) {
  const [phase, setPhase] = useState<Phase>("probing");
  const [signal, setSignal] = useState<Signal>({ kind: "none" });
  const [candidates, setCandidates] = useState<TopicCandidate[]>([]);
  const [editedNames, setEditedNames] = useState<Record<number, string>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [extraNote, setExtraNote] = useState("");
  const [answers, setAnswers] = useState({ recent: "", target_role: "", focus: "" });
  const [error, setError] = useState<string | null>(null);
  const [creatingLabel, setCreatingLabel] = useState("");
  const [hintIndex, setHintIndex] = useState(0);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  // 探测可用信号：简历优先，无简历再看有没有历史填过的目标岗位。
  useEffect(() => {
    let active = true;
    (async () => {
      const [resume, profile] = await Promise.all([
        getResumeStatus().catch(() => null),
        getProfile().catch(() => null),
      ]);
      if (!active) return;
      const status = resume as unknown as { has_resume?: boolean; filename?: string } | null;
      const role = String((profile as unknown as { target_role?: string } | null)?.target_role || "").trim();
      if (status?.has_resume) setSignal({ kind: "resume", filename: status.filename });
      else if (role) setSignal({ kind: "jd", role });
      else setSignal({ kind: "none" });
      setPhase("intro");
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (phase !== "generating") return;
    const timer = setInterval(() => setHintIndex((index) => Math.min(index + 1, GENERATING_HINTS.length - 1)), 2600);
    return () => clearInterval(timer);
  }, [phase]);

  const runSuggest = useCallback(async (payload?: { recent?: string; target_role?: string; focus?: string }) => {
    setError(null);
    setHintIndex(0);
    setPhase("generating");
    try {
      const data = (await suggestTopics(payload)) as unknown as { candidates?: TopicCandidate[] };
      if (!alive.current) return;
      const list = Array.isArray(data?.candidates) ? data.candidates : [];
      setCandidates(list);
      setEditedNames({});
      setSelectedIndex(list.length === 1 ? 0 : null);
      setPhase("candidates");
    } catch (err) {
      if (!alive.current) return;
      setError(errorMessage(err));
      setPhase("questions");
    }
  }, []);

  const start = () => {
    if (signal.kind === "resume") void runSuggest();
    else if (signal.kind === "jd") void runSuggest();
    else setPhase("questions");
  };

  const submitQuestions = () => {
    if (answers.recent.trim().length < 6) {
      setError("再多写一点你在做什么，哪怕一两句话都行。");
      return;
    }
    void runSuggest(answers);
  };

  const regenerate = () => {
    const note = extraNote.trim();
    if (signal.kind === "resume") { void runSuggest(); return; }
    if (!note) { void runSuggest(); return; }
    void runSuggest({
      recent: note,
      target_role: answers.target_role,
      focus: answers.focus,
    });
  };

  const confirm = async (index: number) => {
    const candidate = candidates[index];
    if (!candidate) return;
    const name = (editedNames[index] ?? candidate.name).trim();
    if (!name) return;
    setError(null);
    setPhase("creating");
    setCreatingLabel(`正在创建「${name}」…`);
    try {
      const created = (await createTopic(name, candidate.icon || "FileText")) as unknown as { key: string };
      if (!alive.current) return;
      // 知识库生成失败不阻断：空知识库下仍能出题，用户可以稍后重试。
      setCreatingLabel("正在准备该领域的核心知识…");
      await generateKnowledge(created.key).catch(() => undefined);
      if (!alive.current) return;
      await onCreated(created.key, name);
    } catch (err) {
      if (!alive.current) return;
      setError(errorMessage(err));
      setPhase("candidates");
    }
  };

  if (phase === "probing") {
    return (
      <Card className={cn("border-dashed border-border/80 bg-card/45", className)}>
        <CardContent className="flex min-h-[260px] items-center justify-center gap-3 px-6 text-center text-[13px] text-dim">
          <Loader2 size={16} className="animate-spin" />
          正在看看有什么材料可以用…
        </CardContent>
      </Card>
    );
  }

  if (phase === "intro") {
    const sourceText = signal.kind === "resume"
      ? `发现你上传过简历${signal.filename ? `（${signal.filename}）` : ""}，直接用它来推断方向最准。`
      : signal.kind === "jd"
        ? `你之前填过目标岗位「${signal.role}」，可以按它推断方向。`
        : "";
    return (
      <Card className={cn("border-dashed border-border/80 bg-card/45", className)}>
        <CardContent className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles size={21} />
          </div>
          <h3 className="mt-4 text-base font-semibold text-text">还没有训练领域</h3>
          <p className="mt-2 max-w-md text-[13px] leading-6 text-dim">
            {sourceText || "先说说你的情况，我帮你找出几个值得练的具体方向。"}
            领域会具体到能直接出题的粒度，不是「机械工程」这种大类。
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {signal.kind !== "none" ? (
              <>
                <Button variant="gradient" onClick={start}>
                  <Wand2 size={16} />
                  {signal.kind === "resume" ? "用简历找方向" : "按岗位找方向"}
                </Button>
                <Button variant="outline" onClick={() => setPhase("questions")}>我直接描述</Button>
              </>
            ) : (
              <>
                <Button variant="gradient" onClick={() => setPhase("questions")}>
                  <Wand2 size={16} />
                  帮我想一个方向
                </Button>
                {onCancel && (
                  <Button variant="outline" onClick={onCancel}>
                    <Pencil size={14} />
                    我已经知道要建什么
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (phase === "questions") {
    return (
      <Card className={cn("border-dashed border-border/80 bg-card/45", className)}>
        <CardContent className="px-6 py-7">
          <div className="flex items-center gap-2.5">
            <Sparkles size={18} className="text-primary" />
            <h3 className="text-base font-semibold text-text">说说你的情况</h3>
          </div>
          <p className="mt-1.5 text-[12px] leading-5 text-dim">
            第 1 题随便写点具体的就行，后两题可以留空，我会据此推导方向。
          </p>
          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label>你最近半年主要在做 / 学什么？</Label>
              <Textarea
                rows={3}
                placeholder="例：车间里负责过一条装配线的节拍优化，也做过液压制动系统的选型计算"
                value={answers.recent}
                onChange={(event) => setAnswers({ ...answers, recent: event.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>你想练哪个岗位？<span className="ml-1 text-dim">可选</span></Label>
                <Input
                  placeholder="例：汽车底盘结构设计"
                  value={answers.target_role}
                  onChange={(event) => setAnswers({ ...answers, target_role: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>最想被考到的主题？<span className="ml-1 text-dim">可选</span></Label>
                <Input
                  placeholder="例：制动主缸与轮缸匹配"
                  value={answers.focus}
                  onChange={(event) => setAnswers({ ...answers, focus: event.target.value })}
                />
              </div>
            </div>
          </div>
          {error && <p className="mt-3 text-[12px] text-red">{error}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button variant="gradient" onClick={submitQuestions}>
              <Wand2 size={16} />
              帮我找方向
            </Button>
            {signal.kind !== "none" && (
              <Button variant="ghost" onClick={() => setPhase("intro")}>
                <ArrowLeft size={14} />
                返回
              </Button>
            )}
            {onCancel && (
              <Button variant="ghost" onClick={onCancel}>手动新建</Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (phase === "generating" || phase === "creating") {
    const label = phase === "creating" ? creatingLabel : GENERATING_HINTS[hintIndex];
    return (
      <Card className={cn("border-dashed border-border/80 bg-card/45", className)}>
        <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 text-center">
          <Loader2 size={20} className="animate-spin text-primary" />
          <p className="text-[13px] text-dim">{label}</p>
          {phase === "creating" && (
            <p className="max-w-sm text-[12px] leading-5 text-dim/80">
              这一步稍慢，生成失败也不影响开始训练。
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border-dashed border-border/80 bg-card/45", className)}>
      <CardContent className="px-6 py-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles size={18} className="text-primary" />
            <div>
              <h3 className="text-base font-semibold text-text">
                {candidates.length > 0 ? "这些方向可以练" : "暂时没能归纳出方向"}
              </h3>
              <p className="mt-0.5 text-[12px] text-dim">
                {candidates.length > 0
                  ? "选一个，或直接改成你更习惯的叫法。名称会原样用作训练领域。"
                  : "可能是材料信息不足，补充一句再试一次。"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={regenerate}>
            <RefreshCw size={14} />
            重新生成
          </Button>
        </div>

        {candidates.length > 0 && (
          <div className="mt-5 space-y-2.5">
            {candidates.map((candidate, index) => {
              const name = editedNames[index] ?? candidate.name;
              const selected = selectedIndex === index;
              return (
                <div
                  key={`${candidate.name}-${index}`}
                  className={cn(
                    "rounded-2xl border p-4 transition-all",
                    selected ? "border-primary bg-primary/[0.04] shadow-sm" : "border-border/70 bg-card/60 hover:border-primary/40"
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-start gap-3 text-left"
                    onClick={() => setSelectedIndex(selected ? null : index)}
                  >
                    <span className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-border/80 bg-background text-dim"
                    )}>
                      {getTopicIcon(candidate.icon, 18)}
                    </span>
                    <span className="min-w-0 flex-1">
                      {editingIndex === index ? (
                        <Input
                          autoFocus
                          value={name}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setEditedNames({ ...editedNames, [index]: event.target.value })}
                          onBlur={() => setEditingIndex(null)}
                          onKeyDown={(event) => { if (event.key === "Enter") setEditingIndex(null); }}
                        />
                      ) : (
                        <span className="block text-[14px] font-extrabold leading-snug tracking-tight text-text">{name}</span>
                      )}
                      {candidate.reason && (
                        <span className="mt-1 block text-[12px] leading-5 text-dim">{candidate.reason}</span>
                      )}
                    </span>
                  </button>
                  {candidate.evidence && (
                    <blockquote className="mt-3 border-l-2 border-border/70 pl-3 text-[12px] leading-5 text-dim/90">
                      材料依据：{candidate.evidence}
                    </blockquote>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingIndex(editingIndex === index ? null : index)}
                    >
                      <Pencil size={13} />
                      改名
                    </Button>
                    <Button variant="gradient" size="sm" onClick={() => void confirm(index)}>
                      <BookOpen size={13} />
                      用这个方向
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 space-y-1.5">
          <Label>都不是？补一句你的实际情况，我再想一轮</Label>
          <Input
            placeholder="例：我主要做注塑车间的工艺参数调试"
            value={extraNote}
            onChange={(event) => setExtraNote(event.target.value)}
          />
        </div>
        {error && <p className="mt-3 text-[12px] text-red">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={regenerate} disabled={extraNote.trim().length === 0}>
            <RefreshCw size={13} />
            按补充再生成
          </Button>
          {signal.kind === "none" && (
            <Button variant="ghost" size="sm" onClick={() => setPhase("questions")}>
              <ArrowLeft size={13} />
              改我填的内容
            </Button>
          )}
          {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>手动新建</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
