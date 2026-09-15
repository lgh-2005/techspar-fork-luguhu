import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ChevronRight, Sparkles, Target, Mic, TrendingUp, BriefcaseBusiness } from "lucide-react";
import { getProfile } from "../api/interview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const MODE_CARDS = [
  {
    mode: "resume",
    icon: FileText,
    gradient: "from-amber-500/20 via-orange-500/10 to-transparent",
    iconBg: "bg-amber-500/15 text-amber-400",
    borderActive: "border-amber-500/50",
    badgeVariant: "default",
    title: "简历模拟面试",
    desc: "AI 读取你的简历，模拟真实面试官。从自我介绍到项目深挖，完整走一遍面试流程。",
    tag: "全流程模拟",
  },
  {
    mode: "topic_drill",
    icon: Target,
    gradient: "from-emerald-500/20 via-green-500/10 to-transparent",
    iconBg: "bg-emerald-500/15 text-emerald-400",
    borderActive: "border-emerald-500/50",
    badgeVariant: "success",
    title: "专项强化训练",
    desc: "选一个领域集中刷题，AI 根据你的回答动态调整难度，精准定位薄弱点。",
    tag: "针对强化",
  },
  {
    mode: "job_prep",
    icon: BriefcaseBusiness,
    gradient: "from-sky-500/20 via-cyan-500/10 to-transparent",
    iconBg: "bg-sky-500/15 text-sky-400",
    borderActive: "border-sky-500/50",
    badgeVariant: "blue",
    title: "JD 定向备面",
    desc: "贴入岗位 JD，AI 拆解岗位重点，结合简历生成高概率问题和岗位匹配复盘。",
    tag: "岗位针对",
  },
  {
    mode: "recording",
    icon: Mic,
    gradient: "from-blue-500/20 via-cyan-500/10 to-transparent",
    iconBg: "bg-blue-500/15 text-blue-400",
    borderActive: "border-blue-500/50",
    badgeVariant: "blue",
    title: "录音复盘",
    desc: "上传面试录音或粘贴文字，AI 自动转写分析，帮你复盘每一场真实面试。",
    tag: "录音分析",
  },
];

// 交互式新手通关向导
const GUIDE_STEPS = [
  {
    id: "resume",
    title: "1. 上传专属简历 (必做)",
    desc: "在简历管理中上传真实个人 PDF 简历，系统提炼个人能力图谱",
    target: "/resumes",
    btnText: "去上传简历",
  },
  {
    id: "jd",
    title: "2. 选定目标职位 JD",
    desc: "粘贴目标企业或意向岗位的 JD 描述，AI 拆解核心要求与考点",
    target: "/job-prep",
    btnText: "去配置 JD",
  },
  {
    id: "interview",
    title: "3. 跑通一轮模拟面试",
    desc: "体验 AI 深度针对性提问，体验从项目深挖到技术追问的真实答辩",
    target: "/resume-interview",
    btnText: "开始模拟面试",
  },
  {
    id: "review",
    title: "4. 复盘面试报告与雷达",
    desc: "面试结束后查看复盘诊断、薄弱点雷达及长期能力画像成长池",
    target: "/history",
    btnText: "查看历史复盘",
  },
  {
    id: "voiceprint",
    title: "5. (进阶) 录制个人声纹",
    desc: "在设置中录入 6 秒本人生理声纹，解锁 Copilot 实时只听自己声音",
    target: "/settings#voiceprint",
    btnText: "录制专属声纹",
  },
];

function OnboardingGuide({ onDismiss }) {
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("techspar_guide_completed") || "{}");
    } catch {
      return {};
    }
  });

  const toggleStep = (id, e) => {
    e.stopPropagation();
    const updated = { ...completed, [id]: !completed[id] };
    setCompleted(updated);
    localStorage.setItem("techspar_guide_completed", JSON.stringify(updated));
  };

  const doneCount = GUIDE_STEPS.filter((s) => completed[s.id]).length;
  const progressPercent = Math.round((doneCount / GUIDE_STEPS.length) * 100);

  return (
    <Card className="border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-background to-background/50 backdrop-blur-sm shadow-sm overflow-hidden mb-6">
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
              <h3 className="font-semibold text-foreground text-base">新用户通关指引手册</h3>
              <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-xs">
                进度: {doneCount}/{GUIDE_STEPS.length} ({progressPercent}%)
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              完成以下 5 个关键小步骤，立即解锁完整的 AI 面试与能力成长闭环。点击小方块可手动标记进度。
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="text-xs text-muted-foreground hover:text-foreground self-end sm:self-auto"
          >
            暂时收起
          </Button>
        </div>

        {/* 进度条 */}
        <div className="w-full bg-muted/50 rounded-full h-1.5 mb-4 overflow-hidden">
          <div
            className="bg-amber-500 h-full transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* 步骤卡片列表 */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {GUIDE_STEPS.map((step) => {
            const isDone = Boolean(completed[step.id]);
            return (
              <div
                key={step.id}
                className={cn(
                  "p-3 rounded-lg border transition-all flex flex-col justify-between text-left",
                  isDone
                    ? "bg-muted/40 border-border/40 opacity-75"
                    : "bg-background/80 border-border hover:border-amber-500/40 shadow-xs"
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={cn("text-xs font-medium", isDone ? "line-through text-muted-foreground" : "text-foreground")}>
                      {step.title}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => toggleStep(step.id, e)}
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center text-[10px] transition-colors cursor-pointer",
                        isDone
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-muted-foreground/40 hover:border-amber-500"
                      )}
                      title="标记此步骤"
                    >
                      {isDone && "✓"}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {step.desc}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full text-[11px] h-7 border-amber-500/20 hover:bg-amber-500/10 text-foreground"
                  onClick={() => navigate(step.target)}
                >
                  {step.btnText} →
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const [showGuide, setShowGuide] = useState(() => localStorage.getItem('techspar_hide_guide') !== '1');
  const navigate = useNavigate();
  const [mode, setMode] = useState(null);
  const [profile, setProfile] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    getProfile()
      .then(setProfile)
      .catch(() => null)
      .finally(() => setPageLoading(false));
  }, []);

  const handleStart = () => {
    if (!mode) return;
    const routes = {
      job_prep: "/job-prep",
      recording: "/recording",
      topic_drill: "/topic-drill",
      resume: "/resume-interview",
    };
    navigate(routes[mode] || "/");
  };

  function renderStats() {
    if (pageLoading) {
      return (
        <div className="w-full max-w-[700px] mb-10">
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <Skeleton className="h-5 w-24" />
            <div className="flex gap-6">
              <Skeleton className="h-12 w-20" />
              <Skeleton className="h-12 w-20" />
              <Skeleton className="h-12 flex-1" />
            </div>
          </div>
        </div>
      );
    }
    if (!profile?.stats?.total_sessions > 0 || mode) return null;
    const s = profile.stats;
    const lastEntry = (s.score_history || []).slice(-1)[0];
    const mastery = profile.topic_mastery || {};
    const topTopics = Object.entries(mastery)
      .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
      .slice(0, 3);
    return (
      <Card className="w-full max-w-[700px] mb-10 hover:shadow-md transition-shadow">
        <CardContent className="p-5 md:p-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-primary" />
              <span className="text-[15px] font-semibold">训练概览</span>
            </div>
            <button
              className="text-[13px] text-primary flex items-center gap-1 hover:underline cursor-pointer"
              onClick={() => navigate("/profile")}
            >
              查看画像 <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex flex-wrap gap-4 md:gap-6">
            <StatBox value={s.total_sessions} label="总练习" color="text-primary" />
            <StatBox value={s.avg_score || "-"} label="综合平均" color="text-green" />
            {topTopics.length > 0 && (
              <div className="flex-1 min-w-[120px]">
                <div className="text-[11px] text-dim mb-2">领域掌握</div>
                {topTopics.map(([t, d]) => (
                  <div key={t} className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs w-[70px] text-text truncate">{t}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent-light transition-all duration-500"
                        style={{ width: `${d.score || 0}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-dim w-7 text-right">{d.score || 0}</span>
                  </div>
                ))}
              </div>
            )}
            {lastEntry && (
              <StatBox
                value={lastEntry.avg_score}
                label="上次得分"
                color={lastEntry.avg_score >= 6 ? "text-green" : "text-orange"}
              />
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center px-4 pt-8 pb-10 md:px-6 md:pt-12">
      {/* Hero */}
      <div className="text-center mb-10 md:mb-12 relative">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-gradient-to-b from-primary/10 via-primary/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
            <Sparkles size={14} className="animate-float" />
            AI-Powered Mock Interview
          </div>
          <h1 className="text-3xl md:text-[44px] font-display font-bold mb-3 bg-gradient-to-r from-accent-light via-accent to-orange bg-clip-text text-transparent">
            TechSpar
          </h1>
          <p className="text-base text-dim max-w-[500px]">
            越练越懂你的 AI 面试教练——追踪你的成长轨迹，精准命中薄弱点
          </p>
        </div>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 mb-10 md:mb-12 w-full max-w-[1320px] stagger-children">
        {MODE_CARDS.map((card) => {
          const Icon = card.icon;
          const isActive = mode === card.mode;
          return (
            <div
              key={card.mode}
              className={cn(
                "w-full relative overflow-hidden transition-all duration-300 text-left border-2 rounded-xl group",
                "cursor-pointer",
                isActive
                  ? `border-current ${card.borderActive} bg-card shadow-lg`
                  : "border-border bg-card hover:border-primary/30 hover:shadow-lg hover:-translate-y-1"
              )}
              onClick={() => setMode(card.mode)}
            >
              <div className={cn(
                "absolute inset-0 bg-gradient-to-br pointer-events-none transition-opacity duration-500",
                card.gradient,
                isActive ? "opacity-50" : "opacity-0 group-hover:opacity-15"
              )} />
              <div className="relative px-6 py-7">
                <div className="flex items-center justify-between mb-4">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center transition-all", card.iconBg)}>
                    <Icon size={20} />
                  </div>
                  <Badge variant={card.badgeVariant}>{card.tag}</Badge>
                </div>
                <div className="text-xl font-semibold mb-2">{card.title}</div>
                <div className="text-sm text-dim leading-relaxed">{card.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick stats */}
      {renderStats()}

      {/* Start button */}
      {mode && (
        <div className="w-full max-w-[700px] animate-fade-in-up">
          <Button
            variant="gradient"
            size="lg"
            className="w-full py-6 text-[15px] tracking-wide"
            onClick={handleStart}
          >
            {{
              resume: "开始模拟面试",
              topic_drill: "开始专项训练",
              job_prep: "开始定向备面",
              recording: "前往录音复盘",
            }[mode] || "开始"}
          </Button>
        </div>
      )}
    </div>
  );
}

function StatBox({ value, label, color }) {
  return (
    <div className="text-center min-w-[60px]">
      <div className={cn("text-2xl font-bold", color)}>{value}</div>
      <div className="text-[11px] text-dim mt-0.5">{label}</div>
    </div>
  );
}
