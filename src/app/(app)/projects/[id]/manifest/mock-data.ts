export type MockScene = {
  id: string;
  sceneOrder: number;
  startFrame: number;
  endFrame: number;
  startTimeMs: number;
  endTimeMs: number;
  referenceFrame: number;
  referenceFrameUrl?: string; // R2 public URL for the actual frame image
  candidateFrames: number[];
  candidateFrameUrls?: string[]; // R2 public URLs matching candidateFrames order
  referenceFrameSource: "auto" | "user_selected";
  boundarySource: "ai" | "user_adjusted" | "user_created";
  description: string;
  targetClipDurationS: number;
};

/** 8 evenly-distributed interior frames across [start, end] */
export function candidateFrames(start: number, end: number): number[] {
  const span = end - start;
  if (span <= 0) return [start];
  const step = span / 9;
  return Array.from({ length: 8 }, (_, i) => Math.round(start + step * (i + 1)));
}

/**
 * 12 scenes from a 45-second DTC athletic-wear ad.
 * Reference video: 30 fps, 1350 frames total.
 */
export const MOCK_SCENES: MockScene[] = [
  {
    id: "s01",
    sceneOrder: 1,
    startFrame: 0,
    endFrame: 105,
    startTimeMs: 0,
    endTimeMs: 3500,
    referenceFrame: 52,
    candidateFrames: candidateFrames(0, 105),
    referenceFrameSource: "auto",
    boundarySource: "ai",
    description:
      "Athlete sprinting in slow motion, camera tracking at foot level. Dust particles catch warm morning light. High energy, aspirational opening — sets a kinetic tone.",
    targetClipDurationS: 3.5,
  },
  {
    id: "s02",
    sceneOrder: 2,
    startFrame: 105,
    endFrame: 225,
    startTimeMs: 3500,
    endTimeMs: 7500,
    referenceFrame: 165,
    candidateFrames: candidateFrames(105, 225),
    referenceFrameSource: "auto",
    boundarySource: "ai",
    description:
      "Person in stiff, ill-fitting gym clothes visibly restricted mid-squat. Frustrated expression. Establishes the core pain point immediately.",
    targetClipDurationS: 4.0,
  },
  {
    id: "s03",
    sceneOrder: 3,
    startFrame: 225,
    endFrame: 360,
    startTimeMs: 7500,
    endTimeMs: 12000,
    referenceFrame: 292,
    candidateFrames: candidateFrames(225, 360),
    referenceFrameSource: "auto",
    boundarySource: "ai",
    description:
      "Quick-cut montage: seam stress on a lateral lunge, sweat-soaked fabric bunching up, restricted overhead press. Three athletes, three identical frustrations.",
    targetClipDurationS: 4.5,
  },
  {
    id: "s04",
    sceneOrder: 4,
    startFrame: 360,
    endFrame: 450,
    startTimeMs: 12000,
    endTimeMs: 15000,
    referenceFrame: 405,
    candidateFrames: candidateFrames(360, 450),
    referenceFrameSource: "user_selected",
    boundarySource: "user_adjusted",
    description:
      "Brand logo dissolves in from white. Tagline 'Move Without Limits' fades beneath it. Clean, confident, minimal. Holds for 1.5 seconds.",
    targetClipDurationS: 3.0,
  },
  {
    id: "s05",
    sceneOrder: 5,
    startFrame: 450,
    endFrame: 585,
    startTimeMs: 15000,
    endTimeMs: 19500,
    referenceFrame: 517,
    candidateFrames: candidateFrames(450, 585),
    referenceFrameSource: "auto",
    boundarySource: "ai",
    description:
      "360° rotation of AirFlex Pro leggings on a floating studio pedestal. Macro shot of four-way stretch fabric and ventilation mesh panel. Premium product showcase.",
    targetClipDurationS: 4.5,
  },
  {
    id: "s06",
    sceneOrder: 6,
    startFrame: 585,
    endFrame: 705,
    startTimeMs: 19500,
    endTimeMs: 23500,
    referenceFrame: 645,
    candidateFrames: candidateFrames(585, 705),
    referenceFrameSource: "auto",
    boundarySource: "ai",
    description:
      "Thermal imaging split-screen: competitor fabric showing heat-trapped red zones vs. AirFlex staying cool blue mid-HIIT workout. Athlete mid-sprint under studio lighting.",
    targetClipDurationS: 4.0,
  },
  {
    id: "s07",
    sceneOrder: 7,
    startFrame: 705,
    endFrame: 825,
    startTimeMs: 23500,
    endTimeMs: 27500,
    referenceFrame: 765,
    candidateFrames: candidateFrames(705, 825),
    referenceFrameSource: "auto",
    boundarySource: "user_adjusted",
    description:
      "Gymnast full split, CrossFit athlete overhead press, yogi pigeon pose — all in AirFlex. 'No Restrictions' annotation overlay. Rapid but rhythmic editing.",
    targetClipDurationS: 4.0,
  },
  {
    id: "s08",
    sceneOrder: 8,
    startFrame: 825,
    endFrame: 960,
    startTimeMs: 27500,
    endTimeMs: 32000,
    referenceFrame: 892,
    candidateFrames: candidateFrames(825, 960),
    referenceFrameSource: "auto",
    boundarySource: "ai",
    description:
      "Counter animation rolls to '50,000+ athletes trust AirFlex.' Five-star review cards scroll past. Three customer photo–quote pairings appear sequentially.",
    targetClipDurationS: 4.5,
  },
  {
    id: "s09",
    sceneOrder: 9,
    startFrame: 960,
    endFrame: 1065,
    startTimeMs: 32000,
    endTimeMs: 35500,
    referenceFrame: 1012,
    candidateFrames: candidateFrames(960, 1065),
    referenceFrameSource: "auto",
    boundarySource: "ai",
    description:
      "Sarah, marathon runner, direct-to-camera testimonial: 'I've tried everything. Nothing moves like this. It's the last pair I'll ever need.' Natural, authentic setting.",
    targetClipDurationS: 3.5,
  },
  {
    id: "s10",
    sceneOrder: 10,
    startFrame: 1065,
    endFrame: 1170,
    startTimeMs: 35500,
    endTimeMs: 39000,
    referenceFrame: 1117,
    candidateFrames: candidateFrames(1065, 1170),
    referenceFrameSource: "auto",
    boundarySource: "ai",
    description:
      "Mirror-matched split screen: left athlete struggling in old gear, right same athlete fluid and powerful in AirFlex. Movements synchronized frame-for-frame.",
    targetClipDurationS: 3.5,
  },
  {
    id: "s11",
    sceneOrder: 11,
    startFrame: 1170,
    endFrame: 1260,
    startTimeMs: 39000,
    endTimeMs: 42000,
    referenceFrame: 1215,
    candidateFrames: candidateFrames(1170, 1260),
    referenceFrameSource: "auto",
    boundarySource: "ai",
    description:
      "Full product lineup on clean white. Promo code 'FLEX30' pops in with bold typography. Shop Now button pulses. Limited-time urgency text fades up from bottom.",
    targetClipDurationS: 3.0,
  },
  {
    id: "s12",
    sceneOrder: 12,
    startFrame: 1260,
    endFrame: 1350,
    startTimeMs: 42000,
    endTimeMs: 45000,
    referenceFrame: 1305,
    candidateFrames: candidateFrames(1260, 1350),
    referenceFrameSource: "auto",
    boundarySource: "ai",
    description:
      "Logo lockup centered on white. Website URL fades in beneath. 'Move Without Limits' in bold. Clean hold — lets the brand breathe before cut to black.",
    targetClipDurationS: 3.0,
  },
];

export const MOCK_TOTAL_DURATION_MS = 45000;

/** One color per scene slot for timeline and picker backgrounds */
export const SCENE_COLORS = [
  "#dbeafe", // blue-100
  "#ede9fe", // violet-100
  "#fce7f3", // pink-100
  "#fff7ed", // orange-50
  "#d1fae5", // emerald-100
  "#e0f2fe", // sky-100
  "#e0e7ff", // indigo-100
  "#ccfbf1", // teal-100
  "#fef3c7", // amber-100
  "#fae8ff", // fuchsia-100
  "#ffe4e6", // rose-100
  "#f1f5f9", // slate-100
];
