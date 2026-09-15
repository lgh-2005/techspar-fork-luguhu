import { useState, useEffect } from "react";
import { Megaphone, X } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getSettings } from "@/api/interview";

/**
 * 侧栏底部的“全站公告”板块（替换原本的本月额度条）。
 * 支持管理员在全站服务配置中动态编辑，内容兼容 Markdown 格式。
 */
export default function SidebarAnnouncement({ collapsed }: { collapsed: boolean }) {
  const [announcement, setAnnouncement] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    // 优先从 getSettings 获取，或兜底从 /api/auth/config 获取公开公告
    getSettings()
      .then((data: any) => {
        if (data?.system?.announcement) {
          setAnnouncement(data.system.announcement);
        }
      })
      .catch(() => {
        fetch("/api/auth/config")
          .then((res) => res.json())
          .then((cfg) => {
            if (cfg?.announcement) setAnnouncement(cfg.announcement);
          })
          .catch(() => {});
      });
  }, []);

  const hasContent = Boolean(announcement && announcement.trim());
  const displayPreview = hasContent
    ? announcement.trim().split("\n")[0].replace(/[#*`>]/g, "").slice(0, 16)
    : "暂无全站公告";

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={cn(
              "w-full py-2 px-2.5 rounded-lg text-[13px] transition-all border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/40 text-left",
              collapsed && "flex justify-center px-0"
            )}
          >
            {collapsed ? (
              <span className="relative text-amber-500">
                <Megaphone size={17} />
                {hasContent && (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                )}
              </span>
            ) : (
              <div className="flex items-center gap-2 overflow-hidden">
                <Megaphone size={15} className="shrink-0 text-amber-500" />
                <span className="font-medium text-amber-500 text-xs shrink-0">公告</span>
                <span className="text-[11px] text-muted-foreground truncate flex-1">
                  {displayPreview}
                </span>
              </div>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="max-w-[240px] text-xs">
          {hasContent ? "点击查看详细公告" : "暂无全站公告"}
        </TooltipContent>
      </Tooltip>

      {/* 公告 Markdown 弹窗详情 */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-foreground">全站公告</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground rounded p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3.5 max-h-[60vh] overflow-y-auto text-xs text-foreground leading-relaxed prose prose-sm dark:prose-invert prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1 prose-li:my-0.5">
              {hasContent ? (
                <ReactMarkdown>{announcement}</ReactMarkdown>
              ) : (
                <p className="text-muted-foreground italic py-6 text-center">暂无全站公告内容。</p>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-border/40 flex justify-end">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-3.5 py-1.5 bg-muted text-foreground text-xs rounded-md hover:bg-muted/80"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}