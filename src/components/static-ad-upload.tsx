"use client";

import { useCallback, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Upload, Image, Loader2 } from "lucide-react";

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string; progress: number }
  | { kind: "done"; fileUrl: string }
  | { kind: "error"; message: string };

export function StaticAdUpload({
  jobId,
  onUploaded,
}: {
  jobId: string;
  onUploaded: (fileUrl: string) => void;
}) {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setState({ kind: "error", message: "Please upload an image file (JPG, PNG, or WEBP)" });
        return;
      }

      if (file.size > 50 * 1024 * 1024) {
        setState({ kind: "error", message: "Image must be under 50 MB" });
        return;
      }

      setState({ kind: "uploading", filename: file.name, progress: 0 });

      try {
        // Upload directly to server endpoint (server handles R2)
        const formData = new FormData();
        formData.append("file", file);

        const fileUrl = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setState({
                kind: "uploading",
                filename: file.name,
                progress: Math.round((e.loaded / e.total) * 100),
              });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                resolve(data.fileUrl);
              } catch {
                reject(new Error("Invalid server response"));
              }
            } else {
              reject(new Error(`Upload failed (HTTP ${xhr.status})`));
            }
          };

          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.open("POST", `/api/static-ads/${jobId}/upload`);
          xhr.send(formData);
        });

        setState({ kind: "done", fileUrl });
        onUploaded(fileUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setState({ kind: "error", message: msg });
      }
    },
    [jobId, onUploaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  if (state.kind === "done") {
    return (
      <div className="relative rounded-xl border-2 border-dashed border-green-500/20 bg-green-500/10 p-6 text-center">
        <Image className="h-8 w-8 text-green-500 mx-auto mb-2" />
        <p className="text-sm font-medium text-green-400">Image uploaded</p>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
        state.kind === "error"
          ? "border-red-500/20 bg-red-500/10"
          : "border-[#3f3f46] bg-[#09090b] hover:border-[#3f3f46] hover:bg-[#27272a]"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {state.kind === "uploading" ? (
        <div className="space-y-3">
          <Loader2 className="h-8 w-8 text-[#71717a] mx-auto animate-spin" />
          <p className="text-sm text-[#a1a1aa]">{state.filename}</p>
          <div className="w-48 mx-auto bg-[#27272a] rounded-full h-1.5">
            <div
              className="bg-[#6366f1] h-1.5 rounded-full transition-all"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <p className="text-xs text-[#71717a]">{state.progress}%</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Upload className="h-8 w-8 text-[#71717a] mx-auto" />
          <p className="text-sm font-medium text-[#a1a1aa]">
            Drop a reference ad image here
          </p>
          <p className="text-xs text-[#71717a]">
            JPG, PNG, or WEBP up to 50 MB
          </p>
          {state.kind === "error" && (
            <p className="text-xs text-red-500 mt-2">{state.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
