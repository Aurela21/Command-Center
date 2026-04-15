import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: Promise<{ id: string }> };

const client = new Anthropic();

export async function POST(req: NextRequest, { params }: Params) {
  await params; // validate route

  const { instruction, prompts } = (await req.json()) as {
    instruction: string;
    prompts: Array<{ sceneId: string; sceneOrder: number; prompt: string }>;
  };

  if (!instruction?.trim() || !prompts?.length) {
    return NextResponse.json({ error: "instruction and prompts required" }, { status: 400 });
  }

  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are editing Kling video generation prompts. Apply the user's instruction to each prompt below. Keep the same scene structure and intent — only change what the instruction asks for.

Instruction: ${instruction}

Prompts:
${prompts.map((p) => `Scene ${p.sceneOrder}: ${p.prompt}`).join("\n\n")}

Return ONLY a JSON array of the rewritten prompt strings, in the same order. No explanation, no markdown, just the JSON array.

Example format: ["rewritten prompt 1", "rewritten prompt 2"]`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const match = text.match(/\[[\s\S]*\]/);

  if (!match) {
    return NextResponse.json({ error: "Failed to parse response" }, { status: 502 });
  }

  const newPrompts = JSON.parse(match[0]) as string[];
  const results = prompts.map((p, i) => ({
    sceneId: p.sceneId,
    prompt: newPrompts[i] ?? p.prompt,
  }));

  return NextResponse.json({ results });
}
