export async function addToInstapaper(url: string, title: string, note: string) {
  const user = process.env.INSTAPAPER_USERNAME;
  const pass = process.env.INSTAPAPER_PASSWORD;
  if (!user) throw new Error("INSTAPAPER_USERNAME not set");
  const res = await fetch("https://www.instapaper.com/api/add", {
    method: "POST",
    body: new URLSearchParams({ username: user, password: pass ?? "", url, title, selection: note }),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status !== 201) throw new Error(`Instapaper ${res.status}: ${await res.text()}`);
}
