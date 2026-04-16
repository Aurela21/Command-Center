"use client";

import { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const password = inputRef.current?.value ?? "";

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const redirect = searchParams.get("redirect") ?? "/";
        router.push(redirect);
        router.refresh();
      } else {
        setError("Incorrect password");
        inputRef.current?.focus();
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
      <Card className="w-full max-w-sm shadow-none bg-[#18181b] border-[#27272a]">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-medium text-[#fafafa]">
            Command Center
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[#a1a1aa]">
                Password
              </Label>
              <Input
                id="password"
                ref={inputRef}
                type="password"
                autoFocus
                autoComplete="current-password"
                placeholder=""
                className="bg-[#09090b] border-[#27272a] text-[#fafafa] placeholder:text-[#71717a]"
              />
            </div>
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#6366f1] hover:bg-[#6366f1]/80 text-white"
            >
              {loading ? "Checking…" : "Enter"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
