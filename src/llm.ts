import type { Candidate } from "./fetch";

export type Verdict = { id: number; match: boolean; summary?: string };

const DEFAULT_MODEL = "anthropic/claude-haiku-5-5";

async function runPi(prompt: string, model?: string): Promise<string> {
  const args = [
    "pi", "-p", "--no-session", "--no-tools", "--no-extensions", "--no-skills",
    "--no-prompt-templates", "--no-context-files", "--no-mcp", "--thinking", "off",
    "--model", model ?? DEFAULT_MODEL,
    prompt,
  ];
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`pi exited ${code}: ${err.slice(0, 500)}`);
  return out;
}

export async function judge(
  topics: string[],
  items: Candidate[],
  model?: string,
): Promise<Verdict[]> {
  const list = items
    .map((c, i) => `[${i}] ${c.title}${c.snippet ? ` — ${c.snippet}` : ""}\n    ${c.url}`)
    .join("\n");
  const prompt = `You curate a reading list. Decide which articles are worth saving based ONLY on these topics of interest:
${topics.map((t) => `- ${t}`).join("\n")}

Be selective: match only articles clearly relevant to a topic. You only see titles/snippets, so do not invent details.

Articles:
${list}

Respond with ONLY a JSON array (no prose, no code fences), one object per article:
{"id": <number>, "match": <boolean>, "summary": "<for matches only: 2-3 sentence summary of what the article likely covers and why it matches, in plain text>"}`;
  const raw = await runPi(prompt, model);
  const json = raw.match(/\[[\s\S]*\]/)?.[0];
  if (!json) throw new Error(`No JSON in LLM output: ${raw.slice(0, 300)}`);
  return JSON.parse(json) as Verdict[];
}
