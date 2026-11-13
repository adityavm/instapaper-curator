# instapaper-curator
1. `cp config.example.yaml config.yaml` and `cp .env.example .env`; fill in.
2. `bun run src/index.ts --dry-run` prints what would be added (no side effects).
2b. `bun run scripts/add-source.ts <url> [--name "Name"] [--add]` checks a URL for articles (falling back to RSS/Atom discovery) and prints or appends the `config.yaml` entry.
3. `scripts/install.sh [times...]` installs the launchd job (default daily at 07:00, 12:00, 17:00, 20:00; e.g. `scripts/install.sh 6:30 18`).
4. `scripts/uninstall.sh [--purge]` removes it (`--purge` also deletes data/ and logs/).

Logs: `logs/curator.log`. State: `data/curator.db`.
