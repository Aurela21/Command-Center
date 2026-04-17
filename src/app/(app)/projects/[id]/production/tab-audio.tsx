"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Download,
  Loader2,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Volume2,
} from "lucide-react";
import type { SceneProductionState } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  labels: Record<string, string>;
  preview_url: string | null;
};

type VoiceoverGeneration = {
  id: string;
  url: string;
  voiceId: string;
  voiceName: string;
  speed: number;
  matchedPacing: boolean;
  durationMs: number;
  createdAt: string;
};

type VoiceoverState = {
  voiceId: string | null;
  voiceName: string | null;
  url: string | null;
  speed: number;
  matchPacing: boolean;
  history: VoiceoverGeneration[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`;
}

function durationDiffColor(audioDurationMs: number, videoDurationS: number): string {
  const diff = Math.abs(audioDurationMs / 1000 - videoDurationS) / videoDurationS;
  if (diff <= 0.05) return "text-emerald-400";
  if (diff <= 0.15) return "text-amber-400";
  return "text-red-400";
}

// ─── Voice Preview Player ────────────────────────────────────────────────────

function VoicePreview({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastUrlRef = useRef<string>("");
  const [playing, setPlaying] = useState(false);

  function toggle() {
    // Recreate audio element when the URL changes
    if (!audioRef.current || lastUrlRef.current !== url) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
      }
      const el = new Audio(url);
      el.addEventListener("ended", () => setPlaying(false));
      audioRef.current = el;
      lastUrlRef.current = url;
    }
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(); }}
      className="p-1 rounded text-[#71717a] hover:text-[#a1a1aa] transition-colors"
      title="Preview voice"
    >
      {playing ? <Pause className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
    </button>
  );
}

// ─── Audio Player ────────────────────────────────────────────────────────────

function AudioPlayer({ url, durationMs, videoDurationS }: {
  url: string;
  durationMs: number;
  videoDurationS: number;
}) {
  return (
    <div className="rounded-lg border border-[#27272a] bg-[#09090b] p-4 space-y-3">
      <audio src={url} controls className="w-full h-10" />
      <div className="flex items-center gap-4 text-xs">
        <span className="text-[#a1a1aa]">
          Audio: <span className="font-medium text-[#e4e4e7]">{formatDuration(durationMs)}</span>
        </span>
        <span className="text-[#a1a1aa]">
          Video: <span className="font-medium text-[#e4e4e7]">{videoDurationS.toFixed(1)}s</span>
        </span>
        <span className={cn("font-medium", durationDiffColor(durationMs, videoDurationS))}>
          {Math.abs(durationMs / 1000 - videoDurationS) < 0.5
            ? "Matched"
            : durationMs / 1000 > videoDurationS
            ? `${((durationMs / 1000) - videoDurationS).toFixed(1)}s over`
            : `${(videoDurationS - (durationMs / 1000)).toFixed(1)}s under`}
        </span>
      </div>
      <a
        href={url}
        download
        className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-400 transition-colors"
      >
        <Download className="h-3 w-3" />
        Download MP3
      </a>
    </div>
  );
}

// ─── TabAudio ────────────────────────────────────────────────────────────────

type Props = {
  projectId: string;
  scenes: SceneProductionState[];
  script: string;
  voiceover: VoiceoverState;
};

export function TabAudio({ projectId, scenes, script, voiceover }: Props) {
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(
    voiceover.voiceId
  );
  const [text, setText] = useState(script || "");
  const [speed, setSpeed] = useState(voiceover.speed);
  const [matchPacing, setMatchPacing] = useState(voiceover.matchPacing);
  const [generating, setGenerating] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(voiceover.url);
  const [currentDurationMs, setCurrentDurationMs] = useState<number>(0);
  const [history, setHistory] = useState<VoiceoverGeneration[]>(
    voiceover.history
  );
  const [error, setError] = useState<string | null>(null);

  // Sync script from parent when it changes (e.g. user edits in Script tab)
  useEffect(() => {
    if (script && !text) setText(script);
  }, [script, text]);

  // Compute total video duration
  const totalVideoDurationS = scenes.reduce(
    (sum, s) => sum + (s.targetClipDurationS ?? 5),
    0
  );
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  // Load voices
  useEffect(() => {
    fetch("/api/elevenlabs/voices")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ElevenLabsVoice[]) => {
        setVoices(Array.isArray(data) ? data : []);
        setLoadingVoices(false);
      })
      .catch(() => setLoadingVoices(false));
  }, []);

  // Initialize duration from latest history entry
  useEffect(() => {
    if (voiceover.history.length > 0 && voiceover.url) {
      setCurrentDurationMs(voiceover.history[0].durationMs);
    }
  }, [voiceover.history, voiceover.url]);

  const selectedVoice = voices.find((v) => v.voice_id === selectedVoiceId);

  const handleGenerate = useCallback(async () => {
    if (!selectedVoiceId || !text.trim()) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/generate-voiceover`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voiceId: selectedVoiceId,
            voiceName:
              selectedVoice?.name ?? selectedVoiceId,
            text: text.trim(),
            speed,
            matchPacing,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Generation failed" }));
        throw new Error((body as { error?: string }).error ?? "Generation failed");
      }
      const data = (await res.json()) as {
        url: string;
        durationMs: number;
        speed: number;
        generation: VoiceoverGeneration;
      };
      setCurrentUrl(data.url);
      setCurrentDurationMs(data.durationMs);
      setSpeed(data.speed);
      setHistory((prev) => [data.generation, ...prev].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }, [selectedVoiceId, selectedVoice, text, speed, matchPacing, projectId]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 px-8 py-4 border-b border-[#1a1a1e] bg-[#09090b]/50 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-xs text-[#a1a1aa]">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Video: <span className="font-medium text-[#e4e4e7]">{totalVideoDurationS.toFixed(1)}s</span>
          </span>
          <span>
            {wordCount} words
            <span className="text-[#52525b] ml-1">
              (~{Math.round((wordCount / 150) * 60)}s at natural pace)
            </span>
          </span>
          {history.length > 0 && (
            <span className="text-emerald-500">
              {history.length} generation{history.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleGenerate}
            disabled={generating || !selectedVoiceId || !text.trim()}
            className="gap-2 bg-[#6366f1] hover:bg-[#6366f1]/80 text-white h-9 text-sm disabled:opacity-40"
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Mic className="h-3.5 w-3.5" />
                Generate Voice-Over
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Voice selection */}
          <div>
            <label className="block text-xs font-medium text-[#a1a1aa] mb-2">
              Voice
            </label>
            {loadingVoices ? (
              <div className="flex items-center gap-2 text-xs text-[#71717a]">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading voices…
              </div>
            ) : voices.length === 0 ? (
              <p className="text-xs text-[#71717a]">
                No voices found. Check your ElevenLabs API key.
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={selectedVoiceId ?? ""}
                  onChange={(e) => setSelectedVoiceId(e.target.value || null)}
                  className="flex-1 h-9 rounded-md border border-[#27272a] bg-[#09090b] px-3 text-sm text-[#e4e4e7] focus:outline-none focus:ring-2 focus:ring-[#6366f1]/30"
                >
                  <option value="">Select a voice…</option>
                  {voices.map((v) => (
                    <option key={v.voice_id} value={v.voice_id}>
                      {v.name}
                      {Object.keys(v.labels).length > 0
                        ? ` — ${Object.values(v.labels).slice(0, 3).join(", ")}`
                        : ""}
                    </option>
                  ))}
                </select>
                {selectedVoice?.preview_url && (
                  <VoicePreview url={selectedVoice.preview_url} />
                )}
              </div>
            )}
          </div>

          {/* Script editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-[#a1a1aa]">
                Voice-Over Script
              </label>
              <span className="text-[11px] text-[#52525b]">
                {wordCount} words
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Enter or paste the voice-over script…"
              className="w-full rounded-md border border-[#27272a] bg-[#09090b] px-3 py-2.5 text-sm text-[#e4e4e7] leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-[#6366f1]/30 placeholder:text-[#52525b]"
            />
          </div>

          {/* Pacing controls */}
          <div className="rounded-lg border border-[#27272a] bg-[#18181b] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[#a1a1aa]">
                Pacing
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-[#71717a]">Match video pacing</span>
                <button
                  onClick={() => setMatchPacing(!matchPacing)}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    matchPacing ? "bg-[#6366f1]" : "bg-[#27272a]"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                      matchPacing ? "translate-x-[18px]" : "translate-x-[3px]"
                    )}
                  />
                </button>
              </label>
            </div>

            {/* Speed slider */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-[#71717a]">Speed</span>
                <span className="text-[11px] font-medium text-[#a1a1aa] tabular-nums">
                  {speed.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.7}
                max={1.2}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                disabled={matchPacing}
                className="w-full accent-[#6366f1] disabled:opacity-40"
              />
              <div className="flex justify-between text-[10px] text-[#52525b] mt-1">
                <span>0.7x (slow)</span>
                <span>1.0x</span>
                <span>1.2x (fast)</span>
              </div>
            </div>

            {matchPacing && (
              <p className="text-[11px] text-[#6366f1]">
                Speed will be auto-calculated to fit {totalVideoDurationS.toFixed(1)}s of video.
                {wordCount > 0 && (
                  <span className="text-[#71717a] ml-1">
                    Estimated: {(((wordCount / 150) * 60) / totalVideoDurationS).toFixed(2)}x
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Current audio player */}
          {currentUrl && (
            <AudioPlayer
              url={currentUrl}
              durationMs={currentDurationMs}
              videoDurationS={totalVideoDurationS}
            />
          )}

          {/* Generation history */}
          {history.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[#a1a1aa] mb-3">
                History ({history.length})
              </p>
              <div className="space-y-2">
                {history.map((gen, i) => (
                  <div
                    key={gen.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                      i === 0 && gen.url === currentUrl
                        ? "border-[#6366f1]/30 bg-[#6366f1]/5"
                        : "border-[#1a1a1e] bg-[#09090b]/50"
                    )}
                  >
                    {/* Play button */}
                    <HistoryPlayButton url={gen.url} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-[#e4e4e7]">
                          {gen.voiceName}
                        </span>
                        <span className="text-[#52525b]">•</span>
                        <span className="text-[#71717a] tabular-nums">
                          {gen.speed.toFixed(2)}x
                        </span>
                        {gen.matchedPacing && (
                          <span className="text-[10px] text-[#6366f1] bg-[#6366f1]/10 px-1.5 py-0.5 rounded">
                            Pacing matched
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#71717a] mt-0.5">
                        <span>{formatDuration(gen.durationMs)}</span>
                        <span className="text-[#52525b]">•</span>
                        <span>
                          {new Date(gen.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {gen.url !== currentUrl && (
                        <button
                          onClick={() => {
                            setCurrentUrl(gen.url);
                            setCurrentDurationMs(gen.durationMs);
                          }}
                          className="p-1.5 rounded text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#27272a] transition-colors"
                          title="Use this version"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      )}
                      <a
                        href={gen.url}
                        download
                        className="p-1.5 rounded text-[#52525b] hover:text-blue-500 hover:bg-blue-500/10 transition-colors"
                        title="Download"
                      >
                        <Download className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── History play button ─────────────────────────────────────────────────────

function HistoryPlayButton({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    if (!audioRef.current) {
      const el = new Audio(url);
      el.addEventListener("ended", () => setPlaying(false));
      audioRef.current = el;
    }
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  }

  return (
    <button
      onClick={toggle}
      className="shrink-0 w-8 h-8 rounded-full bg-[#27272a] flex items-center justify-center text-[#a1a1aa] hover:bg-[#3f3f46] transition-colors"
    >
      {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
    </button>
  );
}
