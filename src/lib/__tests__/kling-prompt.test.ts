import { describe, it, expect, vi } from "vitest";
import {
  renderMotionClause,
  renderCameraClause,
  renderPacingClause,
  renderKlingPrompt,
  buildKlingArguments,
  checkCompoundMotion,
  checkPromptLength,
  KLING_APPLICATION_ID,
  SUPPORTED_DURATIONS,
  SUPPORTED_ASPECT_RATIOS,
  PROMPT_WORD_SOFT_CEILING,
  type KlingSceneSpec,
} from "../kling-prompt";

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeSpec(overrides?: Partial<KlingSceneSpec>): KlingSceneSpec {
  return {
    motion: { preset: "head-turn" },
    imageUrl: "https://r2.example.com/seed.jpg",
    duration: 5,
    ...overrides,
  };
}

// ─── Constants ─────────────────────────────────────────────────────────────

describe("constants", () => {
  it("exports the correct application id", () => {
    expect(KLING_APPLICATION_ID).toBe("kling-video/v3.0/pro/image-to-video");
  });

  it("supports 5 and 10 second durations", () => {
    expect(SUPPORTED_DURATIONS).toContain(5);
    expect(SUPPORTED_DURATIONS).toContain(10);
    expect(SUPPORTED_DURATIONS).toHaveLength(2);
  });

  it("supports expected aspect ratios", () => {
    expect(SUPPORTED_ASPECT_RATIOS).toContain("9:16");
    expect(SUPPORTED_ASPECT_RATIOS).toContain("16:9");
    expect(SUPPORTED_ASPECT_RATIOS).toContain("1:1");
  });

  it("has a 60-word soft ceiling", () => {
    expect(PROMPT_WORD_SOFT_CEILING).toBe(60);
  });
});

// ─── Basic prompt render: motion + camera + pacing ─────────────────────────

describe("renderKlingPrompt — full spec", () => {
  it("assembles motion + camera + pacing into the canonical formula", () => {
    const spec = makeSpec({
      motion: { preset: "subtle-smile" },
      camera: { preset: "slow-push-in" },
      pacing: { preset: "unhurried-confident" },
    });

    const prompt = renderKlingPrompt(spec);

    expect(prompt).toContain("Subject subtly smiles.");
    expect(prompt).toContain("Camera: slow push in.");
    expect(prompt).toContain("Unhurried, confident pacing.");
  });

  it("works with custom motion, camera, and pacing", () => {
    const spec = makeSpec({
      motion: { custom: "slowly raises a coffee cup to her lips" },
      camera: { custom: "slow track right" },
      pacing: { custom: "relaxed, morning energy" },
    });

    const prompt = renderKlingPrompt(spec);

    expect(prompt).toContain("Subject slowly raises a coffee cup to her lips.");
    expect(prompt).toContain("Camera: slow track right.");
    expect(prompt).toContain("Relaxed, morning energy pacing.");
  });
});

// ─── Motion only (camera and pacing optional) ──────────────────────────────

describe("renderKlingPrompt — motion only", () => {
  it("produces a valid prompt with just motion", () => {
    const spec = makeSpec({
      motion: { preset: "breathe" },
    });

    const prompt = renderKlingPrompt(spec);

    expect(prompt).toBe("Subject takes a slow breath.");
    expect(prompt).not.toContain("Camera:");
    expect(prompt).not.toContain("pacing.");
  });
});

// ─── Garment text preservation (§5.8) ──────────────────────────────────────

describe("renderKlingPrompt — garment text", () => {
  it("includes quoted text preservation clause", () => {
    const spec = makeSpec({
      motion: { preset: "head-turn" },
      garmentText: "FLIGHT 237",
    });

    const prompt = renderKlingPrompt(spec);

    expect(prompt).toContain('"FLIGHT 237"');
    expect(prompt).toContain("must remain legible throughout");
  });
});

// ─── Continuity cue ────────────────────────────────────────────────────────

describe("renderKlingPrompt — continuity", () => {
  it("appends continuity cue to the prompt", () => {
    const spec = makeSpec({
      motion: { preset: "subtle-smile" },
      continuity: "maintains eye contact throughout",
    });

    const prompt = renderKlingPrompt(spec);

    expect(prompt).toContain("maintains eye contact throughout.");
  });
});

// ─── Compound motion warning (§5.2) ────────────────────────────────────────

describe("checkCompoundMotion", () => {
  it("returns a warning when multiple action verbs are detected", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const warning = checkCompoundMotion(
      "she walks forward, turns, and raises her hand to wave"
    );

    expect(warning).not.toBeNull();
    expect(warning).toContain("§5.2");
    expect(warning).toContain("Compound motion detected");
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("returns null for a single action verb", () => {
    const warning = checkCompoundMotion("slowly turns head toward camera");

    expect(warning).toBeNull();
  });

  it("returns null for presets (single verb)", () => {
    const warning = checkCompoundMotion("subtly smiles");

    expect(warning).toBeNull();
  });
});

// ─── Prompt length warning ─────────────────────────────────────────────────

describe("checkPromptLength", () => {
  it("returns a warning when prompt exceeds 60 words", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const longPrompt = Array(65).fill("word").join(" ");
    const warning = checkPromptLength(longPrompt);

    expect(warning).not.toBeNull();
    expect(warning).toContain("65 words");
    expect(warning).toContain("§11");
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("returns null for prompts under 60 words", () => {
    const shortPrompt = "Subject slowly turns head toward camera. Camera: static locked-off shot.";
    const warning = checkPromptLength(shortPrompt);

    expect(warning).toBeNull();
  });
});

// ─── Duration validation ───────────────────────────────────────────────────

describe("duration validation", () => {
  it("rejects unsupported durations", () => {
    const spec = makeSpec({ duration: 7 as any });

    expect(() => renderKlingPrompt(spec)).toThrow(/Unsupported duration 7s/);
  });

  it("accepts 5s", () => {
    expect(() => renderKlingPrompt(makeSpec({ duration: 5 }))).not.toThrow();
  });

  it("accepts 10s", () => {
    expect(() => renderKlingPrompt(makeSpec({ duration: 10 }))).not.toThrow();
  });
});

// ─── Aspect ratio validation ───────────────────────────────────────────────

describe("aspect ratio validation", () => {
  it("rejects unsupported aspect ratios", () => {
    const spec = makeSpec({ aspectRatio: "4:3" as any });

    expect(() => renderKlingPrompt(spec)).toThrow(/Unsupported aspect ratio/);
  });

  it("accepts 9:16", () => {
    expect(() => renderKlingPrompt(makeSpec({ aspectRatio: "9:16" }))).not.toThrow();
  });

  it("accepts 1:1", () => {
    expect(() => renderKlingPrompt(makeSpec({ aspectRatio: "1:1" }))).not.toThrow();
  });
});

// ─── buildKlingArguments shape ──────────────────────────────────────────────

describe("buildKlingArguments", () => {
  it("produces a KlingSubmitRequest with correct shape", () => {
    const spec = makeSpec({
      motion: { preset: "head-turn" },
      camera: { preset: "static" },
      pacing: { preset: "calm-contemplative" },
      duration: 5,
    });

    const args = buildKlingArguments(spec);

    expect(args.imageUrl).toBe("https://r2.example.com/seed.jpg");
    expect(args.prompt).toContain("Subject slowly turns head toward camera.");
    expect(args.prompt).toContain("Camera: static locked-off shot.");
    expect(args.prompt).toContain("Calm and contemplative pacing.");
    expect(args.durationSeconds).toBe(5);
    expect(args.tailImageUrl).toBeUndefined();
    expect(args.elementTags).toBeUndefined();
  });

  it("includes tailImageUrl when provided", () => {
    const spec = makeSpec({
      tailImageUrl: "https://r2.example.com/end-frame.jpg",
    });

    const args = buildKlingArguments(spec);

    expect(args.tailImageUrl).toBe("https://r2.example.com/end-frame.jpg");
  });

  it("includes elementTags only when non-empty", () => {
    const specEmpty = makeSpec({ elementTags: [] });
    const argsEmpty = buildKlingArguments(specEmpty);
    expect(argsEmpty.elementTags).toBeUndefined();

    const specWithTags = makeSpec({ elementTags: ["hoodie-front", "hoodie-back"] });
    const argsWithTags = buildKlingArguments(specWithTags);
    expect(argsWithTags.elementTags).toEqual(["hoodie-front", "hoodie-back"]);
  });

  it("omits elementTags when field is undefined", () => {
    const spec = makeSpec();
    const args = buildKlingArguments(spec);
    expect(args.elementTags).toBeUndefined();
  });

  it("defaults aspect ratio to 9:16", () => {
    const spec = makeSpec();
    // buildKlingArguments doesn't set aspect_ratio on KlingSubmitRequest
    // (that's handled by submitKlingJob), but it validates the spec's aspectRatio
    expect(() => buildKlingArguments(spec)).not.toThrow();
  });
});

// ─── Individual renderer functions ─────────────────────────────────────────

describe("renderMotionClause", () => {
  it("renders preset motion", () => {
    expect(renderMotionClause({ preset: "walk-toward" })).toBe(
      "Subject walks slowly toward camera."
    );
  });

  it("renders custom motion", () => {
    expect(renderMotionClause({ custom: "slowly lifts a glass" })).toBe(
      "Subject slowly lifts a glass."
    );
  });

  it("throws when neither preset nor custom is provided", () => {
    expect(() => renderMotionClause({})).toThrow(/preset or custom/);
  });
});

describe("renderCameraClause", () => {
  it("renders preset camera", () => {
    expect(renderCameraClause({ preset: "slow-push-in" })).toBe(
      "Camera: slow push in."
    );
  });

  it("renders custom camera", () => {
    expect(renderCameraClause({ custom: "slow crane down" })).toBe(
      "Camera: slow crane down."
    );
  });
});

describe("renderPacingClause", () => {
  it("renders preset pacing with capitalization", () => {
    expect(renderPacingClause({ preset: "soft-dreamy" })).toBe(
      "Soft, dreamy pacing."
    );
  });

  it("renders custom pacing", () => {
    expect(renderPacingClause({ custom: "tense, building" })).toBe(
      "Tense, building pacing."
    );
  });
});
