"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Brain, ChevronLeft, Copy, Image as ImageIcon, Loader2, MessageSquare, Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import type { SceneProductionState } from "./types";

type MediaAttachment = { type: "image" | "video"; mimeType: string; base64: string; name: string };
type Message = { role: "user" | "assistant"; content: string; media?: MediaAttachment[] };
type Session = { id: string; title: string; createdAt: string; updatedAt: string };
type ApplyTarget = { sceneId: string; field: "klingPrompt" | "nanoBananaPrompt" };

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 text-[10px] text-neutral-400 hover:text-neutral-600 transition-colors"
    >
      <Copy className="h-3 w-3" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Apply dropdown ──────────────────────────────────────────────────────────

function ApplyDropdown({ text, scenes, onApply }: { text: string; scenes: SceneProductionState[]; onApply: (t: ApplyTarget, text: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(!open)} className="text-[10px] font-medium text-violet-500 hover:text-violet-700 transition-colors">
        Apply to scene
      </button>
      {open && (
        <div className="absolute right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg z-10 py-1 w-48 max-h-48 overflow-y-auto">
          {scenes.map((s) => (
            <div key={s.sceneId} className="px-2 py-1">
              <p className="text-[10px] font-medium text-neutral-500 mb-0.5">Scene {String(s.sceneOrder).padStart(2, "0")}</p>
              <button onClick={() => { onApply({ sceneId: s.sceneId, field: "klingPrompt" }, text); setOpen(false); }} className="block w-full text-left text-[11px] text-neutral-600 hover:text-violet-600 hover:bg-violet-50 rounded px-1.5 py-0.5">Kling prompt</button>
              <button onClick={() => { onApply({ sceneId: s.sceneId, field: "nanoBananaPrompt" }, text); setOpen(false); }} className="block w-full text-left text-[11px] text-neutral-600 hover:text-violet-600 hover:bg-violet-50 rounded px-1.5 py-0.5">Seed prompt</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({ msg, scenes, onApply }: { msg: Message; scenes: SceneProductionState[]; onApply: (t: ApplyTarget, text: string) => void }) {
  const isUser = msg.role === "user";
  const parts = msg.content.split(/(```[\s\S]*?```)/);

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed", isUser ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700")}>
        {/* Show attached media */}
        {msg.media?.map((att, i) => (
          <div key={i} className="mb-2">
            {att.type === "image" && att.base64 ? (
              <img src={`data:${att.mimeType};base64,${att.base64}`} alt={att.name} className="rounded-lg max-h-40 object-contain" />
            ) : att.type === "image" ? (
              <div className="flex items-center gap-1.5 text-xs opacity-70"><ImageIcon className="h-3 w-3" />{att.name}</div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs opacity-70"><Paperclip className="h-3 w-3" />{att.name}</div>
            )}
          </div>
        ))}
        {parts.map((part, i) => {
          if (part.startsWith("```")) {
            const code = part.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
            return (
              <div key={i} className="my-2">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="text-[10px] text-neutral-400">Suggestion</span>
                  <div className="flex items-center gap-2">
                    <CopyButton text={code} />
                    {!isUser && <ApplyDropdown text={code} scenes={scenes} onApply={onApply} />}
                  </div>
                </div>
                <pre className={cn("text-xs rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap", isUser ? "bg-neutral-800 text-neutral-200" : "bg-white text-neutral-800 border border-neutral-200")}>{code}</pre>
              </div>
            );
          }
          return <span key={i} className="whitespace-pre-wrap">{part}</span>;
        })}
      </div>
    </div>
  );
}

// ─── Chat Panel ──────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  scenes: SceneProductionState[];
  onApply: (target: ApplyTarget, text: string) => void;
};

export function ChatPanel({ open, onClose, projectId, scenes, onApply }: Props) {
  const [view, setView] = useState<"list" | "chat">("list");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<MediaAttachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sessions when panel opens
  useEffect(() => {
    if (open) loadSessions();
  }, [open, projectId]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && view === "chat") setTimeout(() => inputRef.current?.focus(), 200);
  }, [open, view]);

  async function loadSessions() {
    setLoadingSessions(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/chat`);
      if (res.ok) setSessions(await res.json());
    } catch {} finally {
      setLoadingSessions(false);
    }
  }

  async function openSession(sessionId: string) {
    // Load full session messages
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    try {
      // Fetch the session's messages by loading production-state chat endpoint
      // Actually we need to get the messages — they're stored in the session row.
      // For now, re-fetch from the GET endpoint won't return messages (only metadata).
      // Let's add a dedicated endpoint or include messages in list.
      // Simpler: just store a separate GET by session ID.
      // For now: call the chat POST with empty to trigger a load, or just fetch directly.
      const res = await fetch(`/api/projects/${projectId}/chat/session?id=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch {
      setMessages([]);
    }
    setActiveSessionId(sessionId);
    setView("chat");
  }

  function startNewChat() {
    setActiveSessionId(null);
    setMessages([]);
    setView("chat");
  }

  async function deleteSession(sessionId: string) {
    await fetch(`/api/projects/${projectId}/chat?sessionId=${sessionId}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
      setView("list");
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text && pendingMedia.length === 0) return;
    if (loading) return;
    const mediaToSend = [...pendingMedia];
    const userMsg: Message = { role: "user", content: text || "(attached media)", media: mediaToSend.length > 0 ? mediaToSend : undefined };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPendingMedia([]);
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text || "Please analyze the attached image(s).",
          sessionId: activeSessionId,
          media: mediaToSend.length > 0 ? mediaToSend : undefined,
        }),
      });
      if (!res.ok) throw new Error("Chat failed");
      const data = await res.json() as { reply: string; sessionId: string; messages: Message[] };
      setMessages(data.messages);
      if (!activeSessionId) {
        setActiveSessionId(data.sessionId);
        // Refresh session list
        loadSessions();
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("fixed top-0 right-0 h-full w-[420px] bg-white border-l border-neutral-200 shadow-2xl z-50 flex flex-col transition-transform duration-300", open ? "translate-x-0" : "translate-x-full")}>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2.5">
          {view === "chat" && (
            <button onClick={() => setView("list")} className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
            <Brain className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-800">Creative AI</p>
            <p className="text-[10px] text-neutral-400">
              {view === "list" ? `${sessions.length} conversation${sessions.length !== 1 ? "s" : ""}` : `${scenes.length} scenes loaded`}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {view === "list" ? (
        /* ─── Session list ─── */
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <button
              onClick={startNewChat}
              className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 border-dashed border-violet-200 hover:border-violet-400 bg-violet-50/30 text-violet-600 font-medium text-sm transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Conversation
            </button>
          </div>

          {loadingSessions ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-300" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="h-8 w-8 text-neutral-200 mx-auto mb-2" />
              <p className="text-sm text-neutral-400">No conversations yet</p>
            </div>
          ) : (
            <div className="px-4 space-y-1.5">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 group"
                >
                  <button
                    onClick={() => openSession(s.id)}
                    className="flex-1 text-left px-3 py-2.5 rounded-lg hover:bg-neutral-50 transition-colors"
                  >
                    <p className="text-sm text-neutral-700 truncate">{s.title}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      {new Date(s.updatedAt).toLocaleDateString()} {new Date(s.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </button>
                  <button
                    onClick={() => deleteSession(s.id)}
                    className="p-1.5 rounded hover:bg-red-50 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ─── Chat view ─── */
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <Brain className="h-10 w-10 text-neutral-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-neutral-500">Creative Collaborator</p>
                <p className="text-xs text-neutral-400 mt-1 max-w-[280px] mx-auto leading-relaxed">
                  Ask me to write scripts, refine Kling prompts, brainstorm creative direction, or improve any scene.
                </p>
                <div className="mt-4 space-y-1.5">
                  {["Rewrite scene 1's Kling prompt with more energy", "Write dialogue for a model showcasing the hoodie", "Give me 3 variations of the opening scene"].map((s) => (
                    <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }} className="block w-full text-left text-xs text-neutral-500 hover:text-violet-600 bg-neutral-50 hover:bg-violet-50 rounded-lg px-3 py-2 transition-colors">
                      {s}
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
          <div className="shrink-0 border-t border-neutral-200 px-4 py-3 space-y-2">
            {/* Attachment previews */}
            {pendingMedia.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {pendingMedia.map((att, i) => (
                  <div key={i} className="relative group/att">
                    {att.type === "image" ? (
                      <img src={`data:${att.mimeType};base64,${att.base64}`} alt={att.name} className="h-14 w-14 rounded-lg object-cover border border-neutral-200" />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center">
                        <Paperclip className="h-4 w-4 text-neutral-400" />
                      </div>
                    )}
                    <button
                      onClick={() => setPendingMedia((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 p-0.5 rounded-full bg-neutral-900 text-white opacity-0 group-hover/att:opacity-100 transition-opacity"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                    <p className="text-[9px] text-neutral-400 truncate w-14 mt-0.5">{att.name}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  for (const file of files) {
                    const reader = new FileReader();
                    reader.onload = () => {
                      const base64 = (reader.result as string).split(",")[1];
                      const type = file.type.startsWith("video/") ? "video" as const : "image" as const;
                      setPendingMedia((prev) => [...prev, { type, mimeType: file.type, base64, name: file.name }]);
                    };
                    reader.readAsDataURL(file);
                  }
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 w-10 h-10 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-400 hover:text-neutral-600 flex items-center justify-center transition-colors self-end"
                title="Attach image or video"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                rows={2}
                placeholder="Ask about scripts, prompts, creative direction..."
                className="flex-1 text-sm rounded-lg border border-neutral-200 px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 transition-all placeholder:text-neutral-400"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={loading || (!input.trim() && pendingMedia.length === 0)}
                className="shrink-0 w-10 h-10 rounded-lg bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center disabled:opacity-40 transition-colors self-end"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
