# Kling 3.0 via Higgsfield Platform — Command Center Knowledge Base

> Behavioral reference for how the Video Ad Production Command Center generates video. Companion to the Nano Banana 2 knowledge doc.
>
> **Model running the generation:** Kling v3.0 Pro (ByteDance/Kuaishou).
> **API we actually call:** Higgsfield Platform API at `platform.higgsfield.ai`.
> **Application id:** `kling-video/v3.0/pro/image-to-video`.
>
> Both layers matter. Every prompt we send is a Kling prompt filtered through Higgsfield's submission shape, and both have conventions worth knowing.
>
> **Implementation:** `src/lib/kling-prompt.ts` is the prompt-construction module that implements this spec. This document and that module must be updated together when either changes.

---

## 1. Stack overview

The Command Center does not call Kling directly. We call the Higgsfield Platform, which routes our submission to Kling 3.0 Pro and streams the result back. This has practical consequences:

- **Prompt text** goes to Kling's model — Kling prompting conventions apply
- **Submission shape, auth, polling, webhooks** are Higgsfield's — their SDK patterns apply
- **Parameter exposure** is whatever Higgsfield chooses to surface — some Kling parameters may be hidden, renamed, or have different defaults than Kling's direct API
- **Higgsfield-native features** (motion control, camera presets, start/end frames) sit *on top of* Kling as orchestration; if we want those, we use them at the Higgsfield API layer, not via prompt text

Implementation in repo: `src/lib/kling.ts → submitKlingJob()` calls `src/lib/higgsfield.ts → submitRequest()`. Auth is `HF_API_KEY` + `HF_API_SECRET`. Everything video-related flows through this path.

## 2. Model capabilities (Kling 3.0 Pro)

- **Input modes:** image-to-video (our primary), text-to-video, start-and-end-frame
- **Duration:** 3–15 seconds (5s and 10s are the standard selectable values; shorter tends cleaner — see §5.1)
- **Resolution:** 720p or 1080p
- **Aspect ratios:** 16:9, 9:16, 1:1 (we almost always use 9:16 for short-form ads)
- **Audio:** optional native audio generation (leave off unless specifically needed — adds generation time and another failure surface)
- **Reference inputs:** single start frame is standard; start-and-end-frame mode supports a second anchor image
- **Seed:** supported for reproducibility in image-to-video mode

## 3. Prompting philosophy

Same core principle as Nano Banana 2: **natural language, not JSON, not keyword lists.** Kling is trained on video-caption pairs and reasons about prose descriptions of motion and scene. Structured data underperforms.

But video prompting diverges from image prompting in one critical way: **the prompt describes change over time, not a single frozen moment.** An image prompt describes a scene; a video prompt describes what happens during the clip. This changes what should and shouldn't be in the prompt.

### What belongs in a Kling prompt

- The motion that should happen during the clip ("slowly turns head toward camera")
- Camera movement ("slow push in", "static locked-off shot")
- Scene continuity cues ("maintains eye contact throughout")
- Mood/pacing hints ("calm, unhurried")

### What does NOT belong in a Kling prompt (when doing image-to-video)

- Re-describing the subject's appearance in detail — that's the seed image's job. Redundant subject description can confuse the model into "re-interpreting" the seed rather than animating it.
- Re-describing the location — again, the seed image establishes it. Mention the location only if it needs to change during the clip (which is a red flag anyway).
- Clothing, hair color, facial features — all in the seed.

The prompt is a **motion and direction layer** on top of the seed image. Keep it focused there.

## 4. The canonical formula

```
[Motion description] + [Camera direction] + [Pacing/mood]
```

Canonical example for an image-to-video ad:

> Subject slowly turns her head toward the camera and gives a subtle smile. Camera holds static. Unhurried, confident pacing.

That's it. Three short sentences is often enough and usually better than three paragraphs. Kling prompts that balloon past ~60 words tend to produce less coherent motion, not more.

**Implementation:** `renderKlingPrompt()` in `src/lib/kling-prompt.ts` assembles this formula from `KlingSceneSpec`. `buildKlingArguments()` packages the result for `submitKlingJob()`.

## 5. Known failure modes and mitigations

### 5.1 Duration cliff — longer clips degrade faster

**Symptom:** 10s clips show noticeably more artifacting, limb distortion, and motion incoherence than 5s clips of the same scene. The model has more frames to mess up, and errors compound.

**Mitigation:** Default to 5s for all ad cuts. Use 10s only when the ad structure genuinely requires it (e.g., a dialogue beat or reveal that can't be cut shorter). If you need a 10s feel, consider generating two 5s clips and cutting them together in post — often cleaner than one 10s generation.

**Implementation:** `SUPPORTED_DURATIONS = [5, 10]`. The module validates duration and rejects unsupported values.

### 5.2 Compound motion artifacts

**Symptom:** Prompts that stack multiple actions ("she walks forward, turns, and raises her hand to wave") produce jittery transitions between actions, phantom limbs, and motion tearing at the seams between sub-actions.

**Mitigation:** One primary action per clip. If the ad calls for three motions in sequence, that's three clips, not one prompt. Kling cuts cleanly at scene boundaries; it fights itself when asked to sequence actions within a single generation.

**Implementation:** `checkCompoundMotion()` scans the motion clause for multiple action verbs and emits an advisory warning. Does not throw — warns and logs.

### 5.3 Fast motion breaks anatomy

**Symptom:** Fast motion verbs — "sprints", "dances", "throws", "spins" — produce the worst limb artifacts. Hands and fingers are especially fragile.

**Mitigation:** Prefer slow, deliberate motion verbs. "Walks slowly toward camera" > "walks". "Gently lifts hand" > "waves". If the ad genuinely needs fast motion, accept that regen rates will be higher and budget for more attempts.

**Implementation:** Motion vocabulary in §6 is organized by risk tier (slow/medium/high-risk) in the `MOTION_SLOW`, `MOTION_MEDIUM`, `MOTION_HIGH_RISK` maps.

### 5.4 Hand and finger artifacts

**Symptom:** Hands warp, fingers fuse, extra fingers appear — especially when hands cross the body, hold small objects, or gesture near the face.

**Mitigation:**
- Seed frame should have hands clearly visible, well-formed, and away from the body centerline
- Avoid prompts that require hand-to-face contact, hand-to-product contact with small items, or crossed arms as the starting position
- Crop out the hands when possible via framing — medium chest-up shots hide hand artifacts
- If hands must be in the shot and must move, keep motion minimal ("hand rests on cup" not "fingers drum on cup")

### 5.5 Face distortion at extreme angles

**Symptom:** Profile and 3/4 turns produce more facial drift than frontal framing. Fast head turns make it worse.

**Mitigation:**
- Start the seed frame close to the final desired head angle — the model distorts less when it has less distance to travel
- If the creative calls for a head turn, make it slow and small ("slight head turn toward camera" not "turns head sharply")
- For ad hero shots, lock the seed frame to frontal or slight 3/4 and keep the head near-static

### 5.6 Fabric physics breaking

**Symptom:** Flowy fabric — dresses, long sleeves, scarves, hair — physics-glitches in motion. Cloth tears, merges with body, or flutters in impossible directions.

**Mitigation:**
- Minimize fabric-heavy wardrobe in high-motion scenes
- For acid wash tees and fitted hoodies (typical BeautyDrop product), this is less of an issue; for flowy dresses or scarves, accept higher regen rates
- Static or near-static motion (a model standing, breathing, slight head turn) avoids the issue entirely

### 5.7 Multiple subjects in contact

**Symptom:** Two characters interacting — shaking hands, hugging, handing off a product — is one of Kling's hardest cases. Limbs merge, fingers fuse between hands, bodies clip into each other.

**Mitigation:** Avoid multi-subject contact scenes in single generations. If the ad needs it, structure it across cuts — subject A in one shot, subject B in another, cut together with the implication of contact.

### 5.8 Text on garments and signs

**Symptom:** Text that's crisp in the seed frame distorts in the video output, even when the shot barely moves.

**Mitigation:** Same rule as NB2 text drift — if the garment or sign has text that matters, include it in the prompt in quotes: `The text on the hoodie reads "FLIGHT 237" and must remain legible throughout.` Also avoid zooming or pushing into text; static camera preserves it best.

**Implementation:** `KlingSceneSpec.garmentText` — when set, the module appends the quoted preservation clause to the prompt.

## 6. Motion vocabulary

Kling responds best to **specific, visual, moderate-speed motion verbs**. Organized by artifact risk tier in `kling-prompt.ts` as `MOTION_SLOW`, `MOTION_MEDIUM`, `MOTION_HIGH_RISK`.

### Slow, clean (low-artifact) motion — `MOTION_SLOW`

| Key | Prose |
|-----|-------|
| `head-turn` | slowly turns head toward camera |
| `lift-object` | gently lifts object toward face |
| `breathe` | takes a slow breath |
| `weight-shift` | shifts weight from one foot to the other |
| `subtle-smile` | subtly smiles |
| `eye-drift` | eyes slowly drift toward camera |
| `fabric-breeze` | fabric gently catches the breeze |

### Medium motion (acceptable artifact rate) — `MOTION_MEDIUM`

| Key | Prose |
|-----|-------|
| `walk-toward` | walks slowly toward camera |
| `small-wave` | raises hand in a small wave |
| `head-tilt` | tilts head thoughtfully |
| `reach-object` | reaches out to object |
| `begin-laugh` | begins to laugh |

### High-risk motion (avoid or budget for regens) — `MOTION_HIGH_RISK`

| Key | Prose |
|-----|-------|
| `sprint` | sprints forward |
| `dance` | dances energetically |
| `spin` | spins around |
| `throw` | throws object |
| `jump` | jumps up |
| `fast-head-turn` | whips head around |

## 7. Camera direction vocabulary

Camera motion is described as a separate clause. Organized by reliability tier in `kling-prompt.ts` as `CAMERA_CLEAN`, `CAMERA_MODERATE`, `CAMERA_RISKY`.

### Clean camera moves — `CAMERA_CLEAN`

| Key | Prose |
|-----|-------|
| `static` | static locked-off shot |
| `slow-push-in` | slow push in |
| `slow-dolly-in` | slow dolly in |
| `slow-pull-out` | slow pull out |
| `slow-dolly-out` | slow dolly out |
| `slow-pan-left` | slow pan left |
| `slow-pan-right` | slow pan right |
| `slight-handheld` | slight handheld sway |

### Moderate camera moves — `CAMERA_MODERATE`

| Key | Prose |
|-----|-------|
| `medium-push-in` | medium-speed push in |
| `slow-orbit` | slow orbit around subject |
| `gentle-tilt-up` | gentle tilt up |
| `gentle-tilt-down` | gentle tilt down |
| `slow-rack-focus` | slow rack focus from background to subject |

### Risky camera moves — `CAMERA_RISKY`

| Key | Prose |
|-----|-------|
| `fast-whip-pan` | fast whip pan |
| `aggressive-handheld` | aggressive handheld movement |
| `360-orbit` | 360 orbit around subject |
| `crane-up-with-motion` | crane up combined with subject motion |

**Rule of thumb:** if both the subject and the camera are moving, one of them should be slow.

## 8. Pacing and mood vocabulary — `PACING_VOCABULARY`

Optional third clause. Short and vibe-based works best.

| Key | Prose |
|-----|-------|
| `unhurried-confident` | unhurried, confident |
| `energetic-controlled` | energetic but controlled |
| `calm-contemplative` | calm and contemplative |
| `punchy-direct` | punchy, direct |
| `soft-dreamy` | soft, dreamy |

Don't overload this — one or two words is enough. Long mood descriptions get re-interpreted as motion instructions and cause problems.

## 9. Higgsfield-specific features worth knowing

These sit on top of Kling as orchestration layers exposed by Higgsfield. Accessed via the `arguments` on the submission, not via prompt text.

### Start/End frame mode

Supplies two anchor images — the clip starts at the first, ends at the second, and Kling interpolates motion between them.

**Implementation:** `KlingSceneSpec.tailImageUrl` — when set, `buildKlingArguments()` includes it in the submission.

### Motion Control (Kling 2.6+ feature)

Drive motion from a reference video rather than from a text prompt.

### Camera presets

Higgsfield exposes cinematic camera presets separate from Kling's base camera control.

## 10. Submission shape (Higgsfield Platform)

See `buildKlingArguments()` in `src/lib/kling-prompt.ts`. Produces a `KlingSubmitRequest` ready for `submitKlingJob()` in `src/lib/kling.ts`.

## 11. Anti-patterns

- **Don't redescribe the seed image.** The prompt is motion + camera, not a re-render of the scene.
- **Don't stack multiple actions in one prompt.** One primary motion per clip.
- **Don't use high-risk motion verbs unless the creative demands it.** Slow and deliberate beats fast and janky.
- **Don't default to 10s.** Default to 5s, upgrade when needed.
- **Don't write long prose paragraphs.** ~60 words is a soft ceiling. Short beats long.
- **Don't hand-write prompts at call sites.** Everything flows through `kling-prompt.ts`. Extend the module rather than working around it.
- **Don't forget the NB2 seed matters as much as the Kling prompt.** Artifact reduction starts upstream.

## 12. The upstream-first fix order

When a clip comes back with artifacts, work the problem in this order:

1. **Check the seed frame.** Hands clean? Pose correct? If no, regenerate the seed.
2. **Check the motion verb.** High-risk (§6)? Swap for a slower alternative.
3. **Check the duration.** 10s? Try 5s.
4. **Check the framing.** Tight on hands/face? Consider a medium shot.
5. **Check for compound motion.** Multiple actions? Split into clips.
6. **Then reword the prompt.**
7. **Last resort:** try Start/End frame or Motion Control (§9).

## 13. Integration points in the Command Center

| Step | Module | Description |
|------|--------|-------------|
| 3A | `nb2-prompt.ts` → `nano-banana.ts` | Seed image generation |
| 3B | Script tab | Kling prompt editing |
| 3C | `kling-prompt.ts` → `kling.ts` → `higgsfield.ts` | Video generation |

## 14. Changelog

- **Initial version** — baseline conventions from Higgsfield's Kling 3.0 docs (Feb 2026), Higgsfield's Kling 2.6/O1 motion guides, and Command Center's current Step 3C implementation.
- **2026-04-16** — Built `src/lib/kling-prompt.ts` prompt construction module implementing all sections of this spec. Added vocabulary preset tables to §6–§8 with exact keys. Added implementation references throughout.
