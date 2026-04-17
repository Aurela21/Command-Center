import { describe, it, expect } from "vitest";
import {
  renderScenePrompt,
  renderPoseClause,
  preserveGraphicClause,
  preserveTextClause,
  renderTextOverlays,
  vocabularyToProse,
  buildReferenceBlock,
  toProductBundle,
  NEGATIVE_BRAND_HALLUCINATION,
  MAX_REFERENCE_IMAGES,
  NB2_MODEL_ID,
  SUPPORTED_ASPECT_RATIOS,
  type VideoSeedSpec,
  type StaticAdSpec,
  type ProductBundle,
  type PoseSpec,
  type TextOverlay,
  type NB2RefImage,
} from "../nb2-prompt";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const MOCK_POSE: PoseSpec = {
  subject: {
    type: "person",
    bodyOrientation: "faces the camera with square shoulders",
    headPosition: "head centered with a slight left tilt",
    eyeline: "looking directly into the lens",
    pose: "standing, left hand on hip bent at 90 degrees, right arm relaxed at side",
    framing: "waist-up medium shot",
  },
  camera: {
    angle: "eye level",
    shotType: "medium close-up",
    focalLength: "50mm shallow depth of field",
  },
  subjectPlacement: {
    horizontal: "center-right along the rule-of-thirds right line",
    vertical: "head at the upper third",
    scale: "subject fills 60% of frame height",
  },
  lighting: {
    keyDirection: "soft key from the front-left at 45 degrees",
    quality: "soft diffused",
    contrast: "low contrast, fill light present",
  },
};

function makeProductBundle(imageCount = 6): ProductBundle {
  const roles: NB2RefImage["role"][] = [
    "front", "back", "left-side", "right-side", "graphic-detail", "construction-detail",
    "worn-shot", "colorway",
  ];
  return {
    productName: "Airplane Hoodie",
    color: "cream",
    material: "fleece",
    distinctiveGraphic: "airplane graphic on the chest",
    garmentText: "FLIGHT 237",
    references: Array.from({ length: imageCount }, (_, i) => ({
      url: `https://r2.example.com/product/${i}.jpg`,
      role: roles[i % roles.length],
      label: `${roles[i % roles.length]} view`,
    })),
  };
}

// ─── Constants ─────────────────────────────────────────────────────────────

describe("constants", () => {
  it("exports the correct model ID", () => {
    expect(NB2_MODEL_ID).toBe("gemini-3.1-flash-image-preview");
  });

  it("exports 14 as max reference images", () => {
    expect(MAX_REFERENCE_IMAGES).toBe(14);
  });

  it("supports expected aspect ratios", () => {
    expect(SUPPORTED_ASPECT_RATIOS).toContain("9:16");
    expect(SUPPORTED_ASPECT_RATIOS).toContain("1:1");
    expect(SUPPORTED_ASPECT_RATIOS).toContain("16:9");
    expect(SUPPORTED_ASPECT_RATIOS).toContain("1:4");
    expect(SUPPORTED_ASPECT_RATIOS).toContain("8:1");
  });
});

// ─── Text-to-image prompt (no references) ──────────────────────────────────

describe("renderScenePrompt — text-to-image (no refs)", () => {
  it("produces a single text part with subject and vocabulary", () => {
    const spec: VideoSeedSpec = {
      kind: "video-seed",
      subject: "A confident model walking through a neon-lit city at night",
      baseImageUrl: null,
      vocabulary: {
        lighting: "neon-mixed",
        camera: "portrait-85mm",
        colorGrade: "moody-dark",
      },
    };

    const payload = renderScenePrompt(spec);

    expect(payload.parts).toHaveLength(1);
    expect(payload.parts[0].kind).toBe("text");
    expect(payload.aspectRatio).toBe("9:16");

    const text = (payload.parts[0] as { kind: "text"; text: string }).text;
    expect(text).toContain("confident model walking");
    expect(text).toContain("neon color cast");
    expect(text).toContain("85mm portrait lens");
    expect(text).toContain("moody dark grade");
    expect(text).toContain("9:16 vertical portrait");
  });

  it("defaults to 9:16 for video-seed and 1:1 for static-ad", () => {
    const video = renderScenePrompt({
      kind: "video-seed",
      subject: "A model posing",
      baseImageUrl: null,
    });
    expect(video.aspectRatio).toBe("9:16");

    const ad = renderScenePrompt({
      kind: "static-ad",
      subject: "Product hero shot",
      copy: { headline: "Test", body: "Body", cta: "Shop" },
    });
    expect(ad.aspectRatio).toBe("1:1");
  });

  it("includes ad copy block for static-ad kind", () => {
    const spec: StaticAdSpec = {
      kind: "static-ad",
      subject: "Clean product shot on gradient background",
      copy: { headline: "GLOW UP", body: "Transform your look", cta: "Shop Now" },
    };

    const payload = renderScenePrompt(spec);
    const text = (payload.parts[0] as { kind: "text"; text: string }).text;
    expect(text).toContain('"GLOW UP"');
    expect(text).toContain('"Shop Now"');
  });
});

// ─── Product-only reference bundle ─────────────────────────────────────────

describe("renderScenePrompt — product bundle", () => {
  it("produces image parts and relationship prose for a 6-image product", () => {
    const bundle = makeProductBundle(6);
    const spec: VideoSeedSpec = {
      kind: "video-seed",
      subject: "Model wearing the Airplane Hoodie in a studio",
      baseImageUrl: null,
      products: [bundle],
    };

    const payload = renderScenePrompt(spec);

    // Should have: text (product ref header) + 6 images + text (instruction)
    const imageParts = payload.parts.filter((p) => p.kind === "image");
    const textParts = payload.parts.filter((p) => p.kind === "text");

    expect(imageParts).toHaveLength(6);
    expect(textParts.length).toBeGreaterThanOrEqual(2); // header + instruction

    // Relationship prose should mention the product
    const headerText = (textParts[0] as { kind: "text"; text: string }).text;
    expect(headerText).toContain("Airplane Hoodie");

    // Instruction should contain product fidelity clause
    const instructionText = (textParts[textParts.length - 1] as { kind: "text"; text: string }).text;
    expect(instructionText).toContain("CRITICAL PRODUCT FIDELITY");
  });
});

// ─── Full multi-reference (product + talent + mood + location) ─────────────

describe("renderScenePrompt — full multi-reference", () => {
  it("includes all reference types in relationship prose", () => {
    const bundle = makeProductBundle(4);
    const extraRefs: NB2RefImage[] = [
      { url: "https://r2.example.com/talent.jpg", role: "talent", label: "talent reference" },
      { url: "https://r2.example.com/mood.jpg", role: "mood", label: "mood board" },
      { url: "https://r2.example.com/location.jpg", role: "location", label: "street location" },
    ];

    // Add extras to the bundle for this test
    const fullBundle = { ...bundle, references: [...bundle.references, ...extraRefs] };

    const spec: VideoSeedSpec = {
      kind: "video-seed",
      subject: "Model walking through the street wearing the hoodie",
      baseImageUrl: "https://r2.example.com/hero.jpg",
      products: [fullBundle],
    };

    const payload = renderScenePrompt(spec);

    const imageParts = payload.parts.filter((p) => p.kind === "image");
    // 1 base character + 4 product + 3 extras = 8
    expect(imageParts).toHaveLength(8);

    // Check relationship prose mentions all roles
    const allText = payload.parts
      .filter((p) => p.kind === "text")
      .map((p) => (p as { kind: "text"; text: string }).text)
      .join(" ");

    expect(allText).toContain("talent reference");
    expect(allText).toContain("mood");
    expect(allText).toContain("location");
    expect(allText).toContain("BASE CHARACTER");
  });
});

// ─── Pose JSON rendering ───────────────────────────────────────────────────

describe("renderPoseClause", () => {
  it("converts structured pose to flowing prose without JSON or bullets", () => {
    const prose = renderPoseClause(MOCK_POSE);

    // Should be flowing text, not labeled fields
    expect(prose).not.toContain("{");
    expect(prose).not.toContain("}");
    expect(prose).not.toContain("bodyOrientation:");
    expect(prose).not.toContain("- Body:");

    // Should contain the actual values as prose
    expect(prose).toContain("faces the camera with square shoulders");
    expect(prose).toContain("head centered with a slight left tilt");
    expect(prose).toContain("eye level");
    expect(prose).toContain("50mm shallow depth of field");
    expect(prose).toContain("center-right along the rule-of-thirds right line");
    expect(prose).toContain("soft key from the front-left at 45 degrees");
  });
});

// ─── Text overlay rendering ────────────────────────────────────────────────

describe("renderTextOverlays", () => {
  it("renders a single overlay with quoted text and typography", () => {
    const overlays: TextOverlay[] = [
      {
        text: "GLOW UP",
        typographyStyle: "heavy blocky Impact-style sans-serif, all caps",
        placement: "center-aligned, in the lower third",
        color: "white on dark background",
      },
    ];

    const result = renderTextOverlays(overlays);
    expect(result).toContain('"GLOW UP"');
    expect(result).toContain("heavy blocky Impact-style sans-serif");
    expect(result).toContain("lower third");
    expect(result).toContain("white on dark background");
  });

  it("renders multiple overlays with line numbering", () => {
    const overlays: TextOverlay[] = [
      { text: "NEW DROP", typographyStyle: "flowing elegant brush script" },
      { text: "40% OFF", typographyStyle: "heavy blocky Impact font" },
      { text: "Ends Sunday", typographyStyle: "thin minimalist sans-serif" },
    ];

    const result = renderTextOverlays(overlays);
    expect(result).toContain("3 lines of text");
    expect(result).toContain('line 1 "NEW DROP"');
    expect(result).toContain('line 2 "40% OFF"');
    expect(result).toContain('line 3 "Ends Sunday"');
  });
});

// ─── Reference count cap ───────────────────────────────────────────────────

describe("reference count cap", () => {
  it("raises when total references exceed 14", () => {
    const bundle = makeProductBundle(8);
    const bundle2 = makeProductBundle(8);

    const spec: VideoSeedSpec = {
      kind: "video-seed",
      subject: "Too many refs",
      baseImageUrl: null,
      products: [bundle, bundle2],
    };

    expect(() => renderScenePrompt(spec)).toThrow(
      /exceeds maximum of 14/
    );
  });

  it("allows exactly 14 references", () => {
    const bundle = makeProductBundle(8);
    const bundle2: ProductBundle = {
      productName: "Second Product",
      references: Array.from({ length: 6 }, (_, i) => ({
        url: `https://r2.example.com/second/${i}.jpg`,
        role: "custom" as const,
      })),
    };

    const spec: VideoSeedSpec = {
      kind: "video-seed",
      subject: "Exactly 14 refs",
      baseImageUrl: null,
      products: [bundle, bundle2],
    };

    // Should not throw
    expect(() => renderScenePrompt(spec)).not.toThrow();
  });
});

// ─── Unsupported aspect ratio ──────────────────────────────────────────────

describe("aspect ratio validation", () => {
  it("raises on unsupported aspect ratio", () => {
    const spec: VideoSeedSpec = {
      kind: "video-seed",
      subject: "Test",
      baseImageUrl: null,
      aspectRatio: "7:3" as any,
    };

    expect(() => renderScenePrompt(spec)).toThrow(/Unsupported aspect ratio/);
  });
});

// ─── Brand hallucination mitigation ────────────────────────────────────────

describe("brand hallucination mitigation (§5.1)", () => {
  it("includes plain-fabric language when flag is enabled", () => {
    const bundle = makeProductBundle(2);
    const spec: VideoSeedSpec = {
      kind: "video-seed",
      subject: "Model wearing the hoodie",
      baseImageUrl: null,
      products: [bundle],
      mitigateBrandHallucination: true,
    };

    const payload = renderScenePrompt(spec);
    const allText = payload.parts
      .filter((p) => p.kind === "text")
      .map((p) => (p as { kind: "text"; text: string }).text)
      .join(" ");

    expect(allText).toContain(NEGATIVE_BRAND_HALLUCINATION);
    expect(allText).toContain("no logos");
  });

  it("does NOT include plain-fabric language when flag is absent", () => {
    const bundle = makeProductBundle(2);
    const spec: VideoSeedSpec = {
      kind: "video-seed",
      subject: "Model wearing the hoodie",
      baseImageUrl: null,
      products: [bundle],
    };

    const payload = renderScenePrompt(spec);
    const allText = payload.parts
      .filter((p) => p.kind === "text")
      .map((p) => (p as { kind: "text"; text: string }).text)
      .join(" ");

    expect(allText).not.toContain(NEGATIVE_BRAND_HALLUCINATION);
  });
});

// ─── Graphic preservation (§5.2) ───────────────────────────────────────────

describe("graphic preservation (§5.2)", () => {
  it("includes preservation clause when distinctiveGraphic is set", () => {
    const bundle = makeProductBundle(6);
    // Ensure graphic-detail is in the refs
    expect(bundle.references.some((r) => r.role === "graphic-detail")).toBe(true);

    const spec: VideoSeedSpec = {
      kind: "video-seed",
      subject: "Model in studio",
      baseImageUrl: null,
      products: [bundle],
    };

    const payload = renderScenePrompt(spec);
    const allText = payload.parts
      .filter((p) => p.kind === "text")
      .map((p) => (p as { kind: "text"; text: string }).text)
      .join(" ");

    expect(allText).toContain("airplane graphic on the chest");
    expect(allText).toContain("must remain centered");
    expect(allText).toContain("adjusting only for natural garment draping");
  });
});

// ─── Text preservation (§5.3) ──────────────────────────────────────────────

describe("text preservation (§5.3)", () => {
  it("includes quoted text clause when garmentText is set", () => {
    const bundle = makeProductBundle(2);
    const spec: VideoSeedSpec = {
      kind: "video-seed",
      subject: "Model in studio",
      baseImageUrl: null,
      products: [bundle],
    };

    const payload = renderScenePrompt(spec);
    const allText = payload.parts
      .filter((p) => p.kind === "text")
      .map((p) => (p as { kind: "text"; text: string }).text)
      .join(" ");

    expect(allText).toContain('"FLIGHT 237"');
    expect(allText).toContain("preserve this text exactly");
  });
});

// ─── preserveGraphicClause helper ──────────────────────────────────────────

describe("preserveGraphicClause", () => {
  it("references the correct slot number", () => {
    const result = preserveGraphicClause("airplane graphic on the chest", 5);
    expect(result).toContain("reference image 5");
    expect(result).toContain("airplane graphic on the chest");
  });
});

// ─── preserveTextClause helper ─────────────────────────────────────────────

describe("preserveTextClause", () => {
  it("quotes the text exactly", () => {
    const result = preserveTextClause("FLIGHT 237");
    expect(result).toContain('"FLIGHT 237"');
    expect(result).toContain("preserve this text exactly");
  });
});

// ─── vocabularyToProse ─────────────────────────────────────────────────────

describe("vocabularyToProse", () => {
  it("maps keys to prose and joins with commas", () => {
    const result = vocabularyToProse({
      lighting: "golden-hour",
      camera: "portrait-85mm",
      colorGrade: "vintage-film",
    });

    expect(result).toContain("golden-hour sunlight");
    expect(result).toContain("85mm portrait lens");
    expect(result).toContain("vintage film stock");
    expect(result.endsWith(".")).toBe(true);
  });

  it("returns empty string for undefined selections", () => {
    expect(vocabularyToProse(undefined)).toBe("");
  });
});

// ─── buildReferenceBlock ───────────────────────────────────────────────────

describe("buildReferenceBlock", () => {
  it("groups product images and produces relationship prose", () => {
    const bundle = makeProductBundle(4);
    const { prose, images } = buildReferenceBlock(bundle);

    expect(images).toHaveLength(4);
    expect(prose).toContain("Airplane Hoodie");
    expect(prose).toContain("Image 1");
    expect(prose).toContain("Image 4");
    expect(prose).toContain("Preserve the exact graphic placement");
  });

  it("includes extra refs with their own role sentences", () => {
    const bundle = makeProductBundle(2);
    const extraRefs: NB2RefImage[] = [
      { url: "https://example.com/talent.jpg", role: "talent" },
    ];
    const { prose, images } = buildReferenceBlock(bundle, extraRefs);

    expect(images).toHaveLength(3);
    expect(prose).toContain("talent reference");
    expect(prose).toContain("maintain facial features");
  });
});

// ─── toProductBundle ───────────────────────────────────────────────────────

describe("toProductBundle", () => {
  it("maps DB rows to ProductBundle with role inference", () => {
    const bundle = toProductBundle(
      { name: "Test Hoodie", description: "A test product" },
      [
        { fileUrl: "https://r2.example.com/front.jpg", label: "Front View", sortOrder: 0 },
        { fileUrl: "https://r2.example.com/back.jpg", label: "Back View", sortOrder: 1 },
        { fileUrl: "https://r2.example.com/detail.jpg", label: "Hood Detail", sortOrder: 2 },
      ]
    );

    expect(bundle.productName).toBe("Test Hoodie");
    expect(bundle.references).toHaveLength(3);
    expect(bundle.references[0].role).toBe("front");
    expect(bundle.references[1].role).toBe("back");
    expect(bundle.references[2].role).toBe("construction-detail");
  });
});

// ─── Empty subject validation ──────────────────────────────────────────────

describe("input validation", () => {
  it("raises on empty subject", () => {
    const spec: VideoSeedSpec = {
      kind: "video-seed",
      subject: "",
      baseImageUrl: null,
    };

    expect(() => renderScenePrompt(spec)).toThrow(/subject is required/);
  });
});
