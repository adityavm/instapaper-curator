// Usage: bun run scripts/add-source.ts <url> [--name "Name"] [--add]
// Checks the URL for articles; if none are found, looks for RSS/Atom feeds.
// With --add, appends the chosen source to config.yaml.
import { appendFileSync, readFileSync } from "node:fs";
import { discoverFeeds, findFeeds, get, parseFeed, rewriteUrl, scrapeLinks } from "../src/fetch";

const MIN_ARTICLES = 3; // fewer than this = "can't find articles"
const args = process.argv.slice(2);
const nameIdx = args.indexOf("--name");
const input = args.find((a, i) => !a.startsWith("--") && (nameIdx < 0 || i !== nameIdx + 1));
const doAdd = args.includes("--add");
if (!input) {
  console.error('Usage: bun run scripts/add-source.ts <url> [--name "Name"] [--add]');
  process.exit(1);
}

const show = (items: { title: string; url: string }[]) =>
  items.slice(0, 5).forEach((c) => console.log(`    - ${c.title}\n      ${c.url}`));

async function resolve(): Promise<string | null> {
  const url = rewriteUrl(input!);
  if (new URL(url).href !== new URL(input!).href) console.log(`Rewrote to feed URL: ${url}`);
  const body = await get(url);

  const asFeed = parseFeed(body);
  if (asFeed?.length) {
    console.log(`✓ URL is a feed with ${asFeed.length} articles:`);
    show(asFeed);
    return url;
  }

  const links = scrapeLinks(body, url);
  if (links.length >= MIN_ARTICLES) {
    console.log(`✓ Found ${links.length} article links on the page:`);
    show(links);
    const declared = discoverFeeds(body, url);
    if (declared.length) {
      console.log(`  Note: page declares a feed (${declared[0]}); the monitor uses it automatically,`);
      console.log("  which is cleaner than the scraped links above.");
    }
    return url;
  }
  console.log(`✗ Found ${links.length} article links on the page; looking for RSS/Atom feeds...`);

  const feeds = await findFeeds(body, url);
  if (!feeds.length) return null;
  console.log(`✓ Found ${feeds.length} feed(s):`);
  for (const f of feeds) console.log(`    - ${f.url} (${f.count} articles)`);
  const best = feeds[0]!;
  console.log(`Using: ${best.url}`);
  return best.url;
}

const sourceUrl = await resolve().catch((e) => {
  console.error(`✗ Failed to fetch ${input}: ${e}`);
  process.exit(1);
});
if (!sourceUrl) {
  console.error("✗ No articles or feeds found. The page may be JS-rendered; try finding a feed URL manually.");
  process.exit(1);
}

const name = nameIdx >= 0 ? args[nameIdx + 1]! : new URL(sourceUrl).host.replace(/^www\./, "");
const entry = `  - name: ${JSON.stringify(name)}\n    url: ${sourceUrl}\n`;

if (!doAdd) {
  console.log(`\nAdd this under \`sources:\` in config.yaml (or re-run with --add):\n\n${entry}`);
} else {
  const cfg = readFileSync("config.yaml", "utf8");
  if (cfg.includes(sourceUrl)) { console.log("Already in config.yaml."); process.exit(0); }
  const topKeys = [...cfg.matchAll(/^([A-Za-z]\w*):/gm)].map((m) => m[1]);
  if (topKeys.at(-1) !== "sources") {
    console.error("`sources:` isn't the last key in config.yaml; add it manually:\n\n" + entry);
    process.exit(1);
  }
  appendFileSync("config.yaml", (cfg.endsWith("\n") ? "" : "\n") + entry);
  console.log("\nAdded to config.yaml. The next run will baseline it (mark existing articles as seen).");
}
