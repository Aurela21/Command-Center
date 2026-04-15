"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Brain, Copy, Loader2, Send, X } from "lucide-react";
import type { SceneProductionState } from "./types";

type Message = {
  role: "user" | "assistant";
  content: string;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-[10px] text-neutral-400 hover:text-neutral-600 transition-colors"
      title="Copy to clipboard"
    >
      <Copy className="h-3 w-3" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ApplyDropdown({
  text,
  scenes,
  onApply,
}: {
  text: string;
  scenes: SceneProductionState[];
  onApply: (target: ApplyTarget, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] font-medium text-violet-500 hover:text-violet-700 transition-colors"
      >
        Apply to scene
      </button>
      {open && (
        <div className="absolute right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg z-10 py-1 w-48 max-h-48 overflow-y-auto">
          {scenes.map((s) => (
            <div key={s.sceneId} className="px-2 py-1">
              <p className="text-[10px] font-medium text-neutral-500 mb-0.5">
                Scene {String(s.sceneOrder).padStart(2, "0")}
              </p>
              <button
                onClick={() => { onApply({ sceneId: s.sceneId, field: "klingPrompt" }, text); setOpen(false); }}
                className="block w-full text-left text-[11px] text-neutral-600 hover:text-violet-600 hover:bg-violet-50 rounded px-1.5 py-0.5 transition-colors"
              >
                Kling prompt
              </button>
              <button
                onClick={() => { onApply({ sceneId: s.sceneId, field: "nanoBananaPrompt" }, text); setOpen(false); }}
                className="block w-full text-left text-[11px] text-neutral-600 hover:text-violet-600 hover:bg-violet-50 rounded px-1.5 py-0.5 transition-colors"
              >
                Seed prompt
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  msg,
  scenes,
  onApply,
}: {
  msg: Message;
  scenes: SceneProductionState[];
  onApply: (target: ApplyTarget, text: string) => void;
}) {
  const isUser = msg.role === "user";
  const parts = msg.content.split(/(```[\s\S]*?```)/);

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-neutral-900 text-white"
            : "bg-neutral-100 text-neutral-700"
        )}
      >
        {parts.map((part, i) => {
          if (part.startsWith("```")) {
            const code = part.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
            return (
              <div key={i} className="my-2">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="text-[10px] text-neutral-400">Suggestion</span>
                  <div className="flex items-center gap-2">
                    <CopyButton text={code} />
                    {!isUser && (
                      <ApplyDropdown text={code} scenes={scenes} onApply={onApply} />
                    )}
                  </div>
                </div>
                <pre className={cn(
                  "text-xs rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap",
                  isUser ? "bg-neutral-800 text-neutral-200" : "bg-white text-neutral-800 border border-neutral-200"
                )}>
                  {code}
                </pre>
              </div>
            );
          }
          return (
            <span key={i} className="whitespace-pre-wrap">
              {part}
            </span>
          );
        })}
      </div>
    </div>
  );
}

type ApplyTarget = { sceneId: string; field: "klingPrompt" | "nanoBananaPrompt" };

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  scenes: SceneProductionState[];
  onApply: (target: ApplyTarget, text: string) => void;
};

export function ChatPanel({ open, onClose, projectId, scenes, onApply }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages,
        }),
      });

      if (!res.ok) throw new Error("Chat failed");
      const data = (await res.json()) as { reply: string };
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        "fixed top-0 right-0 h-full w-[420px] bg-white border-l border-neutral-200 shadow-2xl z-50 flex flex-col transition-transform duration-300",
        open ? "translate-x-0" : "translate-x-full"
      )}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
            <Brain className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-800">Creative AI</p>
            <p className="text-[10px] text-neutral-400">{scenes.length} scenes loaded</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <Brain className="h-10 w-10 text-neutral-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-neutral-500">Creative Collaborator</p>
            <p className="text-xs text-neutral-400 mt-1 max-w-[280px] mx-auto leading-relaxed">
              Ask me to write scripts, refine Kling prompts, brainstorm creative direction, or improve any scene.
            </p>
            <div className="mt-4 space-y-1.5">
              {[
                "Rewrite scene 1's Kling prompt with more energy",
                "Write dialogue for a model showcasing the hoodie",
                "Give me 3 variations of the opening scene",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                  className="block w-full text-left text-xs text-neutral-500 hover:text-violet-600 bg-neutral-50 hover:bg-violet-50 rounded-lg px-3 py-2 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} scenes={scenes} onApply={onApply} />
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
              <span className="text-xs text-neutral-500">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-neutral-200 px-4 py-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            placeholder="Ask about scripts, prompts, creative direction..."
            className="flex-1 text-sm rounded-lg border border-neutral-200 px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 transition-all placeholder:text-neutral-400"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="shrink-0 w-10 h-10 rounded-lg bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center disabled:opacity-40 transition-colors self-end"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
