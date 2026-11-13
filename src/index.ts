import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { addToInstapaper } from "./instapaper";
import { isSeen, isSourceInitialized, markSourceInitialized, record } from "./db";
import { fetchCandidates } from "./fetch";
import { judge } from "./llm";

type Config = {
  topics: string[];
  model?: string;
  maxCandidatesPerSource?: number;
  sources: { name: string; url: string }[];
};

mkdirSync("logs", { recursive: true });
const dryRun = process.argv.includes("--dry-run");
// Dry runs print to stdout only; they never touch the log file, DB or Instapaper.
const log = (msg: string) => {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  if (!dryRun) appendFileSync("logs/curator.log", line + "\n");
};
const config = Bun.YAML.parse(readFileSync("config.yaml", "utf8")) as Config;
const max = config.maxCandidatesPerSource ?? 40;
let added = 0;

log(`run start${dryRun ? " (dry run)" : ""}: ${config.sources.length} sources`);

for (const src of config.sources) {
  try {
    const all = await fetchCandidates(src.url);
    if (!all.length) { log(`[${src.name}] WARNING: no articles found (JS-rendered or unparseable page?)`); continue; }
    const fresh = all.filter((c) => !isSeen(c.url));

    if (!isSourceInitialized(src.url)) {
      if (!dryRun) {
        for (const c of all) record({ ...c, source: src.name }, "baseline");
        markSourceInitialized(src.url);
        log(`[${src.name}] first run: marked ${all.length} existing articles as seen`);
        continue;
      }
      log(`[${src.name}] not yet baselined; previewing against current articles`);
    }
    if (!fresh.length) { log(`[${src.name}] no new articles`); continue; }

    // Newest first (stable: undated items keep feed order, which is usually newest first).
    fresh.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    const batch = fresh.slice(0, max);
    log(`[${src.name}] ${fresh.length} new, judging ${batch.length}`);
    const verdicts = await judge(config.topics, batch, config.model);
    const byId = new Map(verdicts.map((v) => [v.id, v]));

    for (const [i, c] of batch.entries()) {
      const v = byId.get(i);
      const item = { ...c, source: src.name };
      if (!v?.match) { if (!dryRun) record(item, "skipped"); continue; }
      const summary = v.summary?.trim() ?? "";
      try {
        if (dryRun) {
          log(`[${src.name}] WOULD ADD ${c.title} <${c.url}>\n    ${summary}`);
        } else {
          await addToInstapaper(c.url, c.title, summary);
          record(item, "added", undefined, summary);
          log(`[${src.name}] ADDED ${c.title} <${c.url}>\n    ${summary}`);
        }
        added++;
      } catch (e) {
        if (!dryRun) record(item, "error", String(e));
        log(`[${src.name}] ERROR adding ${c.url}: ${e}`);
      }
    }
    // Articles beyond the cap stay unseen and are judged next run.
  } catch (e) {
    log(`[${src.name}] ERROR: ${e}`);
  }
}
log(`run end: ${added} ${dryRun ? "would be added (dry run)" : "added"}`);
