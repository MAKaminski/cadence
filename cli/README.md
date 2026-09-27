# cadence-posts: the Cadence CLI

Check in, review drafts, see *why* each draft reads the way it does, approve and see results, from your terminal. It's a thin client for the [Cadence API](../docs/API.md), with types generated from its OpenAPI spec.

```bash
npm install -g cadence-posts
cadence login --host https://YOUR-CADENCE-HOST        # paste a key from Settings → API keys
```

| Command | Does |
|---|---|
| `cadence status` | Plan, LinkedIn connection, this week's posts vs target, model use |
| `cadence checkin "notes…"` or `cat notes.md \| cadence checkin` | Save a check-in; drafting starts right away |
| `cadence drafts [-s draft,held,scheduled]` | List drafts |
| `cadence show <id>` | A draft in full |
| `cadence why <id>` | Every check, what was fixed or held, the model and cost |
| `cadence edit <id> -f post.txt` | Replace the text (re-checked; approve again) |
| `cadence approve <id>` | Shows the exact text and asks before approving (needs the `approve` scope). `--yes` skips the prompt |
| `cadence skip <id>` | Skip |
| `cadence stats [-w 8]` | Posts per week against your target, and your best post |
| `cadence logout` | Forget the key |

The key is stored in `~/.config/cadence/credentials`, readable only by you (mode 0600). `CADENCE_API_KEY` and `CADENCE_HOST` override it, for CI and scripts.

Limits: 60 requests a minute per key and 20 check-ins a day. The CLI prints `retry in Ns` when rate limited. There is no "post now": approved posts go out on your schedule.

MIT licensed. Not affiliated with LinkedIn.
