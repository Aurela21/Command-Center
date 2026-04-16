# Nano Banana 2 — Command Center Knowledge Base

> Behavioral reference for how the Video Ad Production Command Center talks to Google's Nano Banana 2 (Gemini 3.1 Flash Image) image model.
>
> **Source of truth for generic model behavior:** Google's [Ultimate Nano Banana Prompting Guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana). This document captures the delta between generic model guidance and how the Command Center uses it.
>
> **Implementation:** `src/lib/nb2-prompt.ts` is the prompt-construction module that implements this spec. This document and that module must be updated together when either changes.

---

## 1. Model overview

Nano Banana 2 is Google's shorthand for **Gemini 3.1 Flash Image** (API id: `gemini-3-1-flash-image-preview`). It's a Gemini 3-family model with image output. Key capabilities relevant to this system:

- Deep-reasoning prompt understanding — the model reasons about the prompt before generating
- Up to **14 reference images** in a single call
- Resolutions: 512px, 1K, 2K, 4K
- Aspect ratios: 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9, plus extreme formats 1:4, 4:1, 1:8, 8:1
- Real-time web search grounding
- Native text rendering — production-grade typography, often removing the need for Pillow compositing on headlines
- Context window: 131,072 input tokens, 32,768 output tokens
- Knowledge cutoff: January 2025; supplement with web grounding when needed
- All outputs carry C2PA Content Credentials and a SynthID watermark

## 2. Prompting philosophy

**Natural language, not JSON, not keyword lists.** The model is trained on image-caption pairs, and its reasoning layer operates on descriptive prose. Structured inputs such as JSON, key-value dumps, or bullet attribute lists consistently underperform flowing narrative descriptions, because the model has to re-translate structure back into language before reasoning.

The Command Center stores scene specs as structured JSON internally (for versioning, diffing, and programmatic manipulation) and **renders them to prose at prompt-build time** via `renderScenePrompt()` in `src/lib/nb2-prompt.ts`. Structured data never reaches the model.

### Core principles

1. **Be specific** — concrete subject, lighting, composition details
2. **Positive framing** — "empty street" beats "no cars"
3. **Camera control** — photographic and cinematic vocabulary ("low angle", "aerial view", "35mm film", "f/1.8")
4. **Iterate conversationally** — prefer follow-up refinement prompts over rewriting from scratch
5. **Start with a strong verb** — tells the model the primary operation

## 3. The two canonical formulas

All prompts in this system derive from one of two formulas. The module auto-selects between them based on whether reference images are present.

### Text-to-image (no references)

```
[Subject] + [Action] + [Location/context] + [Composition] + [Style]
```

Canonical example from Google:

> A striking fashion model wearing a tailored brown dress, sleek boots, and holding a structured handbag. Posing with a confident, statuesque stance, slightly turned. A seamless, deep cherry red studio backdrop. Medium-full shot, center-framed. Fashion magazine style editorial, shot on medium-format analog film, pronounced grain, high saturation, cinematic lighting effect.

**Implementation:** When `SceneSpec` has no product bundles and no base image, `renderScenePrompt()` builds a single text part following this formula.

### Multi-reference (product scenes, talent scenes, composition refs)

```
[Reference images] + [Relationship instruction] + [New scenario]
```

The **relationship instruction** is where fidelity is earned. Every reference image passed in must be explicitly described in the prompt text — what it is, what the model should take from it, what to preserve. Passing 8 images with "use these" wastes the feature.

**Implementation:** When product bundles or base images exist, `renderScenePrompt()` outputs interleaved image + text parts. The `buildReferenceBlock()` function generates the relationship instruction prose automatically from the `NB2RefImage.role` fields.

## 4. Reference bundle convention

Every product in the Command Center library carries a **reference bundle** — a set of images with documented roles, not a single hero shot. The bundle is what gets injected into multi-reference prompts.

### Standard product bundle (6–8 images)

1. Front view (flat lay or mannequin) — role: `front`
2. Back view — role: `back`
3. Left 3/4 or side — role: `left-side`
4. Right 3/4 or side — role: `right-side`
5. Graphic/print detail — tight crop of distinctive artwork — role: `graphic-detail`
6. Construction detail — hood, cuff, hem, trim, or label — role: `construction-detail`
7. Worn shot — neutral model, neutral lighting (shows drape and fit) — role: `worn-shot`
8. Optional: alternate colorway hero — role: `colorway`

That leaves 6–8 reference slots for scene inputs within the 14-image ceiling:

- Talent reference (for character consistency) — role: `talent`
- Lighting/mood board reference — role: `mood`
- Location reference — role: `location`
- Pose reference (if not expressed purely in prose from the pose JSON) — role: `pose`
- Style reference — role: `style`

Typical total: 10–12 references with headroom.

**Implementation:** The `ProductBundle` type in `nb2-prompt.ts` holds the product name, optional color/material/graphic/text metadata, and an ordered array of `NB2RefImage` with roles. The `toProductBundle()` function converts DB rows to this type, auto-mapping image labels to roles via best-effort string matching.

### Relationship instruction template

The relationship instruction follows this shape, written as prose:

> Images 1–7 are reference views of the same product — front, back, sides, graphic detail, construction detail, and fit reference. Preserve the exact graphic placement, scale, color, and proportions across all generated views. Image 8 is the talent reference; maintain facial features and body type. Image 9 is the lighting mood reference; match its quality and direction. Image 10 is the location reference; use its palette and spatial feel.

**Implementation:** `buildReferenceBlock()` groups images by role, numbers them sequentially, and generates one prose sentence per group with role-specific instructions from the `ROLE_INSTRUCTIONS` map.

## 5. Known failure modes and mitigations

### 5.1 Brand hallucination on apparel

**Symptom:** Random brand marks, wordmarks, or logos appear on clothing that should be plain. Especially bad on caps, hoodies, and t-shirts.

**Mitigation:** Append explicit plain-fabric language to the subject description:

> "…wearing a plain [color] [garment] with no logos, no brand marks, no text, and no graphics on the fabric…"

**When the product does have a graphic:** Let the product reference images do the work. Keep the prompt focused on preserving the *referenced* graphic ("preserve the exact graphic from the reference images") rather than describing the graphic in prose, which invites the model to re-invent it.

**Implementation:** Callers opt in via `mitigateBrandHallucination: true` on `SceneSpec`. The module injects the `NEGATIVE_BRAND_HALLUCINATION` constant for each product bundle, using the bundle's `color` and `material` fields to build the clause. Exported as a constant so callers can inspect the exact text.

### 5.2 Graphic distortion at extreme angles

**Symptom:** The hero graphic warps, stretches, or shifts position on 3/4 turns, arm-raised poses, or tight crops.

**Mitigation:** Include a dedicated graphic-detail close-up in the product bundle (slot 5), and add explicit preservation language:

> "The airplane graphic on the chest must remain centered, at the same scale and orientation as in reference image 5, adjusting only for natural garment draping."

**Implementation:** Auto-triggered when `ProductBundle.distinctiveGraphic` is set and the bundle contains an image with role `graphic-detail`. The `preserveGraphicClause()` function generates the clause referencing the correct image slot number.

### 5.3 Text drift on garments

**Symptom:** Existing text on a referenced product (wordmarks, numbers, care labels) generates with altered letters or nonsense characters.

**Mitigation:** If the garment has text, quote it explicitly in the prompt:

> "The text on the garment reads \"FLIGHT 237\" — preserve this text exactly."

NB2's text rendering is strong but benefits from explicit quotation.

**Implementation:** Auto-triggered when `ProductBundle.garmentText` is set. The `preserveTextClause()` function double-quotes the exact text.

### 5.4 Color shift under varied lighting

**Symptom:** The product's color subtly reads differently under golden hour vs studio vs overcast.

**Reality check:** This is partly correct behavior — real fabrics shift under different light. It becomes a problem when the shift reads as a different SKU.

**Mitigation:** Anchor the color name in the subject description regardless of lighting, and include the worn reference shot (slot 7) so the model has a non-neutral lighting baseline:

> "…wearing the cream fleece airplane hoodie (color anchored to reference image 7)…"

**Implementation:** Auto-triggered when `ProductBundle.color` is set and the bundle contains an image with role `worn-shot`. The module generates a color-anchoring clause referencing the worn-shot slot.

### 5.5 Print pattern position drift

**Symptom:** Stochastic patterns — acid wash, tie-dye, heavy all-over prints — shift position between generations even when the product is "the same."

**Reality check:** Largely unfixable at the prompt layer. The model treats stochastic patterns as a *style* to reproduce, not a fixed asset.

**Mitigation:** Accept pattern-position drift as a feature of the product. For brand-critical exact-match scenarios, composite the real product photo in post rather than relying on NB2 to reproduce it.

**Implementation:** No automatic mitigation. Documented here so callers understand the limitation.

## 6. Text rendering

NB2 is capable enough at text rendering that for most static ad headlines, direct rendering beats Pillow compositing. Not always, though.

**Render with NB2 when:**
- Headline is 8 words or fewer
- Typography is a named common style (sans-serif, serif, brush script, Impact-style block)
- Color and position can be described in prose
- No exact-pixel alignment required

**Keep Pillow compositing when:**
- Typography must be pixel-locked to a grid
- Multiple lines with tight tracking control
- Brand-standard fonts required (Bebas Neue, DM Sans, Inter — Command Center's existing stack)
- Ad variants where only text changes and backgrounds must be identical

### Text prompting rules (when rendering directly)

1. Enclose exact words in double quotes: `"GLOW UP"`
2. Describe typography by style *and* structure: "a heavy blocky Impact-style sans-serif, all caps, center-aligned, in the lower third"
3. For multi-line layouts, describe each line's role explicitly:

   > Render three lines of text: top line "NEW DROP" in a flowing elegant brush script; middle line "40% OFF" in a heavy blocky Impact font; bottom line "Ends Sunday" in a thin minimalist sans-serif.

4. **Text-first trick:** For complex rendered text, generate the text concept in a prior conversational turn, then reference it in the image prompt. Improves results on longer text.

**Implementation:** The `TextOverlay` type carries `text`, `typographyStyle`, optional `placement` and `color`. `renderTextOverlays()` handles single-line (simple clause) and multi-line (numbered "Render N lines of text:…" format) rendering with proper quoting. `TEXT_OVERLAY_WORD_LIMIT = 8` is exported as a constant for callers to check before choosing NB2 vs Pillow.

## 7. Camera, lighting, and style vocabulary

The model responds to specific photographic terminology. These vocabularies are represented as `as const satisfies Record<string, string>` maps in `nb2-prompt.ts`, mapping preset keys to prose fragments.

### Lighting (`LIGHTING_PRESETS`)

| Key | Prose |
|-----|-------|
| `golden-hour` | warm golden-hour sunlight raking at 15 degrees above horizon |
| `overcast-soft` | soft overcast daylight, even diffusion, no hard shadows |
| `studio-beauty` | frontal beauty dish with subtle fill, catchlight in eyes |
| `studio-dramatic` | single hard key light from camera-left 45 degrees, deep shadows opposite |
| `backlit-rim` | strong backlight creating rim highlights, face in gentle shadow |
| `neon-mixed` | mixed neon color cast, cyan and magenta spill on skin |
| `window-natural` | soft window light from camera-right, natural falloff |
| `overhead-flat` | overhead flat panel, minimal shadows, even commercial look |
| `low-key` | low-key lighting, single spot, majority of frame in shadow |
| `high-key` | high-key lighting, bright and airy, minimal shadows |

### Camera and lens (`CAMERA_LENS_PRESETS`)

| Key | Prose |
|-----|-------|
| `wide-24mm` | 24mm wide-angle lens, slight barrel distortion, deep depth of field |
| `standard-35mm` | 35mm standard lens, natural perspective, moderate depth of field |
| `portrait-50mm` | 50mm lens, shallow depth of field, subject isolation |
| `portrait-85mm` | 85mm portrait lens, compressed background, creamy bokeh |
| `telephoto-135mm` | 135mm telephoto, strong background compression, tight framing |
| `macro-detail` | macro lens, extreme close-up, paper-thin depth of field |
| `cinematic-anamorphic` | anamorphic lens, horizontal flare, cinematic feel |

### Color grading and film stock (`COLOR_GRADE_PRESETS`)

| Key | Prose |
|-----|-------|
| `neutral` | neutral color grading, true-to-life tones |
| `warm-analog` | warm analog film tones, lifted shadows, orange-teal split |
| `cool-desaturated` | cool desaturated palette, blue-grey shadows, muted highlights |
| `high-saturation` | punchy high-saturation grading, vivid colors, deep blacks |
| `pastel-soft` | soft pastel palette, low contrast, dreamy and airy |
| `moody-dark` | moody dark grade, crushed blacks, selective color pop |
| `vintage-film` | vintage film stock look, grain, faded blacks, warm midtones |

### Materiality

Be specific. "Tweed navy jacket" not "jacket". "Ribbed cotton cream crewneck" not "sweater". "Matte black anodized aluminum" not "metal". Materiality language is where cheap-looking generations get fixed.

**Implementation:** Vocabulary selections are passed via `SceneSpec.vocabulary` with typed keys (`LightingPreset`, `CameraLensPreset`, `ColorGradePreset`). `vocabularyToProse()` maps keys to prose fragments and joins them into a style sentence.

## 8. Pose JSON to prose

The Command Center stores pose/composition specs as structured JSON (Claude Vision produces these via `analyzePoseComposition()` in `src/lib/claude.ts`). The prompt-builder converts that JSON into a prose fragment injected into the composition section.

### Rendering rules

- Body orientation — "facing camera", "3/4 turn to camera-left", "profile view"
- Hand placement — "left hand in pocket, right hand relaxed at side"
- Head angle — "chin slightly lifted", "head tilted 10° to camera-right"
- Camera position — "camera at chest height", "low angle, 30° below subject eyeline"
- Subject placement in frame — "centered", "lower-third left", "rule-of-thirds intersection, upper-right"
- Lighting direction — covered by §7 vocab, but pose may override key-light side

Never paste raw pose JSON into the prompt. Always render to prose.

**Implementation:** `renderPoseClause()` in `nb2-prompt.ts` takes a `PoseSpec` (re-exported `PoseCompositionSpec` from `claude.ts`) and renders it as flowing prose — subject body/head/eyes in one sentence, camera in another, placement in another, lighting in another. No JSON, no labeled fields, no bullet lists. The output reads like natural English.

## 9. Anti-patterns

- **Don't send JSON as the prompt text.** Structured internally, prose externally.
- **Don't use keyword lists.** "Fashion, model, brown dress, studio, cherry red, cinematic" is strictly worse than the equivalent sentence.
- **Don't stack negatives.** "No X, no Y, no Z" works for the brand hallucination case but shouldn't be the default framing. Prefer positive descriptions ("plain fabric") over negative lists.
- **Don't re-describe the product graphic in prose when it's in the reference bundle.** The reference is the source of truth. Describing it in prose invites the model to interpolate between your description and the reference, usually badly.
- **Don't skip the relationship instruction on multi-ref calls.** Every reference needs its role explained in the prompt.
- **Don't exceed 14 reference images.** API hard limit. The module raises an error if the total exceeds `MAX_REFERENCE_IMAGES`.
- **Don't hand-write prompts at call sites.** Everything flows through `renderScenePrompt()` in `src/lib/nb2-prompt.ts`. Extend the module rather than working around it.

## 10. Integration points in the Command Center

### Current NB2 usage

All prompt construction flows through `src/lib/nb2-prompt.ts`. API calls flow through `src/lib/nano-banana.ts`.

| Pipeline | Route handler | SceneSpec kind | Output |
|----------|--------------|----------------|--------|
| Video seed images | `src/app/api/projects/[id]/generate-seed/route.ts` | `VideoSeedSpec` | One hero frame per scene, later animated by Kling |
| Static ad generation | `src/app/api/static-ads/[id]/generate/route.ts` | `StaticAdSpec` | Product scene with copy, then optional Pillow compositing |

### Architecture

```
Route handler (DB queries, @tag resolution, toProductBundle())
    ↓
nb2-prompt.ts → renderScenePrompt(SceneSpec) → NB2PromptPayload
    ↓
nano-banana.ts → payloadToGeminiParts() → Gemini API call
    ↓
Response parsing → R2 upload → quality scoring
```

### Active features

- Claude Vision → `PoseCompositionSpec` → `renderPoseClause()` prose injection at seed generation
- Post-generation Claude Vision pose comparison to auto-flag pose mismatches before user review
- Product learnings injection (positive/negative signals from past approvals/rejections)
- Rejection history injection to avoid repeating past mistakes
- Auto-scoring every generation via `scoreGeneration()` in `claude.ts`
- Composition spec comparison for static ads via `compareAdToSpec()`

### Discriminated union pattern

The module uses a discriminated union for scene specs:

- `VideoSeedSpec` (`kind: "video-seed"`) — has `baseImageUrl`, `poseReferenceUrl`, `poseSpec`
- `StaticAdSpec` (`kind: "static-ad"`) — has `copy`, `psychAnalysis`, `compositionSpec`

This makes invalid states unrepresentable at the type level.

## 11. Changelog

Track behavioral learnings here. When a new failure mode is found or a mitigation is revised, date-stamp the change. Prevents the doc from decaying into historical fiction.

- **Initial version** — established baseline conventions from Google's March 2026 prompting guide and existing BeautyDrop pipeline experience.
- **2026-04-16** — Built `src/lib/nb2-prompt.ts` prompt construction module implementing all sections of this spec. Updated §2-§10 with implementation references. Route handlers (`generate-seed`, `static-ads/generate`) now build `SceneSpec` objects and call `renderScenePrompt()` instead of hand-writing prompts. Legacy inline prompt building in `nano-banana.ts` preserved for backward compatibility but bypassed when `nb2Payload` is provided. Added vocabulary preset tables to §7 with exact keys. Added role annotations to §4 bundle slots. 26 unit tests in `src/lib/__tests__/nb2-prompt.test.ts`.
