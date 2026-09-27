/**
 * The test suites measured with every tool: FFmpeg's FATE samples
 * (corpus/compat/fate.mjs) and whatever corpus/compat/suite.mjs has run
 * (corpus/compat/suites/<name>-summary.json, described by corpus/suites/<name>.json).
 * File lists are large, so they load when a folder is opened.
 */
import type { Suite, Counts } from "$lib/components/SuiteView.svelte";
import fate from "../../../../corpus/compat/fate-summary.json";

type Failure = {
  path: string;
  video: string | null;
  audio: string | null;
  ffmpeg: boolean;
  vlc: boolean;
  vlc4?: boolean | null;
  wasmAvformat: boolean | null;
  cause: string;
  wasmError: string;
};
type Summary = {
  overall: Counts;
  folders: Record<string, Counts>;
  description?: string;
  subset?: string;
  license?: string | null;
  actionable?: Failure[];
  unplayableByAll?: string[];
};
/** What the tab shows beyond the counts: failures by cause, how the suite was sampled. */
const details = (s: Summary) => ({
  subset: s.subset,
  license: s.license ?? undefined,
  failures: s.actionable ?? [],
  unplayable: s.unplayableByAll?.length ?? 0,
});
type Definition = {
  name?: string;
  title?: string;
  description?: string;
  homepage?: string;
  source?: string;
};

const summaries = import.meta.glob<Summary>(
  "../../../../corpus/compat/suites/*-summary.json",
  { eager: true, import: "default" },
);
const matrices = import.meta.glob(
  "../../../../corpus/compat/suites/*-matrix.json",
  { import: "default" },
);
const definitions = import.meta.glob<Definition>(
  "../../../../corpus/suites/*.json",
  { eager: true, import: "default" },
);

const keyOf = (path: string, suffix: string) =>
  path.split("/").pop()!.replace(suffix, "");

export const SUITES: Suite[] = [
  {
    key: "fate",
    title: "FFmpeg's FATE",
    description:
      "FFmpeg's regression-test samples: every container and codec FFmpeg has a test for, including the H.264 (JVT), HEVC (JCT-VC) and VVC conformance streams.",
    source: "https://fate-suite.ffmpeg.org/",
    overall: (fate as unknown as Summary).overall,
    folders: (fate as unknown as Summary).folders,
    ...details(fate as unknown as Summary),
    files: async () =>
      (await import("../../../../corpus/compat/fate-matrix.json"))
        .default as never,
  },
  ...Object.entries(summaries)
    .map(([path, s]): Suite | null => {
      const key = keyOf(path, "-summary.json");
      if (key === "fate") return null;
      const def =
        Object.entries(definitions).find(
          ([p]) => keyOf(p, ".json") === key,
        )?.[1] ?? {};
      const matrix = Object.entries(matrices).find(
        ([p]) => keyOf(p, "-matrix.json") === key,
      )?.[1];
      return {
        key,
        title: def.title ?? def.name ?? key,
        description: def.description ?? "",
        source: def.homepage ?? def.source,
        overall: s.overall,
        folders: s.folders,
        ...details(s),
        files: async () => ((await matrix?.()) ?? []) as never,
      };
    })
    .filter((s): s is Suite => s !== null),
];
