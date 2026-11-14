import { XMLParser } from "fast-xml-parser";

export type Candidate = { url: string; title: string; snippet: string; date?: number; legacyUrl?: string };

const UA = "Mozilla/5.0 (compatible; instapaper-curator/0.1)";
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

const arr = <T>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const text = (x: any): string =>
  x == null ? "" : typeof x === "object" ? String(x["#text"] ?? "") : String(x);
const ts = (x: any): number | undefined => {
  const t = Date.parse(text(x));
  return Number.isNaN(t) ? undefined : t;
};
export const strip = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Techmeme items link to their own permalink; the real article URL is the headline link in the description. */
function resolveTechmeme(link: string, rawDesc: string): { url: string; legacyUrl?: string } {
  try {
    if (!/(^|\.)techmeme\.com$/.test(new URL(link).host)) return { url: link };
  } catch { return { url: link }; }
  const m =
    rawDesc.match(/<B>\s*<A\s[^>]*HREF=["']([^"']+)["']/i) ??
    [...rawDesc.matchAll(/<A\s[^>]*HREF=["']([^"']+)["']/gi)].find((x) => !/techmeme\.com/i.test(x[1]!));
  return m ? { url: m[1]!.trim(), legacyUrl: link } : { url: link };
}

export function parseFeed(body: string): Candidate[] | null {
  let doc: any;
  try { doc = xml.parse(body); } catch { return null; }
  if (doc?.rss || doc?.["rdf:RDF"]) {
    const items = arr(doc.rss?.channel?.item ?? doc["rdf:RDF"]?.item);
    return items
      .map((i: any) => ({
        ...resolveTechmeme(text(i.link).trim(), text(i.description)),
        title: strip(text(i.title)),
        snippet: strip(text(i.description ?? i["content:encoded"])).slice(0, 400),
        date: ts(i.pubDate ?? i["dc:date"]),
      }))
      .filter((c) => c.url && c.title);
  }
  if (doc?.feed) {
    return arr<any>(doc.feed.entry)
      .map((e) => {
        const links = arr<any>(e.link);
        const l = links.find((x) => x["@_rel"] === "alternate") ?? links[0];
        return {
          url: String(l?.["@_href"] ?? "").trim(),
          title: strip(text(e.title)),
          snippet: strip(text(e.summary ?? e.content)).slice(0, 400),
          date: ts(e.published ?? e.updated),
        };
      })
      .filter((c) => c.url && c.title);
  }
  return null;
}

export function discoverFeeds(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link[^>]+>/gi)) {
    if (!/type=["']application\/(?:rss|atom)\+xml["']/i.test(m[0])) continue;
    const href = m[0].match(/href=["']([^"']+)["']/i)?.[1];
    if (href) out.push(new URL(href, base).toString());
  }
  return out;
}

const COMMON_FEED_PATHS = ["/feed", "/feed/", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml", "/feeds/posts/default"];

/** Returns feed URLs that actually parse, from <link> tags then common paths. */
export async function findFeeds(html: string, base: string): Promise<{ url: string; count: number }[]> {
  const origin = new URL(base).origin;
  const guesses = COMMON_FEED_PATHS.map((p) => origin + p);
  const urls = [...new Set([...discoverFeeds(html, base), ...guesses])];
  const found: { url: string; count: number }[] = [];
  for (const url of urls) {
    try {
      const items = parseFeed(await get(url));
      if (items?.length) found.push({ url, count: items.length });
    } catch {}
  }
  return found;
}

export function scrapeLinks(html: string, base: string): Candidate[] {
  const host = new URL(base).host;
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string;
    try { url = new URL(m[1]!, base).toString(); } catch { continue; }
    const title = strip(m[2]!);
    // Heuristic: same-host, headline-like text, non-trivial path
    if (new URL(url).host !== host || title.length < 20 || new URL(url).pathname.length < 2) continue;
    if (url === base || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title, snippet: "" });
  }
  return out;
}

// Reddit pages are JS-rendered shells with no feed link; use their built-in RSS instead.
export function rewriteUrl(url: string): string {
  const u = new URL(url);
  if (/(^|\.)reddit\.com$/.test(u.host) && !u.pathname.endsWith(".rss")) {
    u.pathname = u.pathname.replace(/\/?$/, "/.rss");
  }
  return u.toString();
}

export async function fetchCandidates(sourceUrl: string): Promise<Candidate[]> {
  const url = rewriteUrl(sourceUrl);
  const body = await get(url);
  const direct = parseFeed(body);
  if (direct) return direct;
  const feeds = discoverFeeds(body, url);
  if (feeds[0]) {
    const fromFeed = parseFeed(await get(feeds[0]));
    if (fromFeed?.length) return fromFeed;
  }
  return scrapeLinks(body, url);
}
