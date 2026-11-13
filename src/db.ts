import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

mkdirSync("data", { recursive: true });
export const db = new Database("data/curator.db");
db.run(`CREATE TABLE IF NOT EXISTS articles (
  url TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL, -- baseline | skipped | added | error
  reason TEXT,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.run(`CREATE TABLE IF NOT EXISTS sources (
  url TEXT PRIMARY KEY,
  initialized_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

export const isSourceInitialized = (url: string) =>
  !!db.query("SELECT 1 FROM sources WHERE url = ?").get(url);
export const markSourceInitialized = (url: string) =>
  db.query("INSERT OR IGNORE INTO sources (url) VALUES (?)").run(url);
export const isSeen = (url: string) =>
  !!db.query("SELECT 1 FROM articles WHERE url = ?").get(url);
export const record = (
  a: { url: string; source: string; title: string },
  status: string,
  reason?: string,
  summary?: string,
) =>
  db
    .query(
      `INSERT OR REPLACE INTO articles (url, source, title, status, reason, summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(a.url, a.source, a.title, status, reason ?? null, summary ?? null);
