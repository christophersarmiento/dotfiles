# Status bar

The entry point is `../statusbar.ts`. This directory contains accounting, Git, and presentation helpers; it intentionally has no `index.ts`, so Pi does not load it as a second extension.

## Accounting

- **Session** matches Pi's `/session` scope: all saved entries in the current session, including abandoned branches and inherited fork history. It includes assistant usage, tool-reported nested model usage, compaction usage, and branch-summary usage.
- **Week** includes usage dated in the current calendar week, starting Sunday at midnight in `America/New_York`. Message timestamps are used where available, with entry timestamps as the fallback. Summary usage uses its entry timestamp.
- Copied fork entries are deduplicated across sessions using a hash of the entry ID, original timestamp, and message identity. Parent links and session IDs are excluded because forks change them. Legacy entries without IDs use a payload fingerprint.
- Costs are Pi's recorded model-cost estimates, not a provider billing statement. Usage a tool does not report cannot be inferred. An independently saved child session and a tool aggregate describing the same child calls have no generic cross-link in Pi's usage format; do not interpret the total as invoice reconciliation.

## Persistence and refresh

Pi's JSONL session logs are the durable source of truth. This includes saved RPC and print sessions: accounting does not depend on those sessions rendering a footer.

The index scans these locations:

- `<agent directory>/sessions`
- The active session's storage directory
- `PI_CODING_AGENT_SESSION_DIR`, when set

Other custom session directories are outside the total unless they are under one of those roots. Ephemeral (`--no-session`) usage is included only while that session is active; the extension does not override Pi's no-persistence setting. Deleting session logs removes their unique usage from the total. Historical usage without a usable timestamp cannot be assigned to a week.

The index refreshes every five seconds while the footer is active. Local totals update at persisted turn/tool/summary events, without waiting for the weekly scan. A `~` before the weekly amount means the initial scan is still running or a source could not be fully read, such as a temporarily incomplete JSONL write. This marker clears after a successful refresh.

A disposable cache lives at `<agent directory>/cache/statusbar/v1`. It contains source-file fingerprints and usage hashes/week keys/costs, not conversation content. Unchanged sources are not reparsed. Cache writes are asynchronous, use private file permissions and atomic replacement, and happen only when a source needs indexing. A missing, stale, malformed, or unwritable cache does not prevent reading session logs. No cache pruning runs during aggregation.

## Migration

The entry point, helper directory, and cache directory were renamed from `colorful-statusbar` to `statusbar`. Existing cache files can be moved to `cache/statusbar/` without changing their contents. Missing caches rebuild automatically. Reload older running instances so they use the new cache path.

Run `/reload` to activate changes in an existing Pi session. The first scan rebuilds totals from available session logs. The old `<agent directory>/weekly-costs` snapshots are ignored and left untouched; their totals cannot be reliably migrated because they lack individual usage timestamps. Older running instances may keep writing those snapshots until reloaded, without affecting the new totals.

## Display

- Raw ANSI palette colors retain the original terminal theme behavior, except the thinking-level label, which uses Pi's active thinking-level editor-border color and follows theme changes.
- Costs move to the second footer line when the full status line does not fit. Very narrow terminals use `s` and `w` cost labels.
- Other extensions' footer statuses are retained when space permits, except the MCP server summary. MCP authentication progress remains visible.
- Unknown context after compaction is shown as `?`, not cumulative historical tokens.
- Git statistics compare tracked working-tree contents against `HEAD`, including staged and unstaged changes as a net diff. Untracked and binary-file line counts are not included. Before the first commit, the comparison uses Git's empty tree without writing an object to the repository.

## GitHub Copilot usage

When the active model's provider is `github-copilot`, provider usage replaces the session/week dollar section. Context-window usage remains separate. Providers other than Copilot, Codex, Anthropic OMP, and OpenRouter retain the existing dollar display, including any historical mixed-provider session costs.

- **Finite AI-credit allowance**: `usage 4,124/17,200 (24%) @ Oct 1`.
- **No finite user allowance**: `usage 754 @ Oct 1`. Credit units are implied in the footer. `unlimited: true` does not imply unlimited organization credits; no denominator or percentage is invented.
- **Legacy billing**: `usage 60/300 (20%) premium requests`, derived from reported entitlement and remaining requests, not tokens or credits.
- **Unknown usage**: `usage unavailable`, never a fabricated zero. Initial fetches show `usage loading…`.
- **Stale usage**: a dimmed `~` prefix marks a retained snapshot after a refresh fails. A snapshot is discarded after 15 minutes or at its reported billing reset, whichever happens first.
- **Reset date**: `@ Oct 1` follows the usage on the same line, using the reported UTC date. It is omitted when unknown. This is user-level usage for Copilot's billing period, not Pi session/week usage or the organization's pooled balance; it can include other clients.

AI-credit billing uses `credits_used` directly. A positive `entitlement` is shown only when `unlimited` is explicitly false and `has_quota` is not false. Percentages are calculated from used/entitlement, rounded to whole percentages, and may exceed 100% when overages are reported. Fractional amounts retain up to two decimal places. `remaining`, `quota_remaining`, and `percent_remaining` are not used to reconstruct AI-credit consumption. Missing or contradictory billing-unit metadata is handled conservatively.

The extension makes read-only requests to `https://api.github.com/copilot_internal/user`, an **internal API that may change**. It uses Pi's public `readStoredCredential` helper to read the existing GitHub OAuth `refresh` credential from the standard agent auth store. It neither refreshes/modifies credentials nor uses the short-lived inference `access` token. Non-OAuth credentials and custom GitHub Enterprise login domains currently show unavailable rather than sending credentials to an unverified endpoint. SDK-only/in-memory credential stores are not exposed through the extension context and are not supported here.

Requests run outside rendering, only while Copilot is selected. The existing five-second footer tick checks for credential changes and requests a quota refresh at most once per minute. Concurrent requests within a footer are coalesced; provider changes and disposal abort pending requests. Requests time out after ten seconds; failures use exponential backoff and honor `Retry-After` up to one hour. Authentication/permission failures discard cached usage. Model changes trigger an immediate check but reuse fresh cached data.

Quota snapshots live separately at `<agent directory>/cache/statusbar/copilot-v1/`. Filenames hash the endpoint and OAuth credential to isolate accounts without storing credentials. Files contain only normalized usage, limit, unit, reset date, and fetch time, and use private permissions and atomic replacement. They are replaceable snapshots, not an accumulated ledger. Fresh snapshots can be reused by other sessions; there is no cross-process request lock. Cache failures do not block live retrieval, and no cache pruning runs. The existing `v1/` dollar-cost cache and session logs are unchanged.

## OpenAI Codex usage

When `openai-codex` is selected, the session/week dollar section is replaced by the primary and secondary ChatGPT-plan usage percentages, for example `7h 24% | 7d 48%`. Labels come from the API's `limit_window_seconds`: a reported five-hour window displays `5h`, not `7h`. Missing durations use `primary`/`secondary` instead of guessing. Reported reset times use local time and are omitted in the compact layout. These are account-wide used percentages, not remaining allowance or Pi-only usage.

`codex.ts` reads Pi's stored `openai-codex` OAuth access credential via `readStoredCredential` and makes read-only requests to `https://chatgpt.com/backend-api/wham/usage`. The account header comes from the credential's `accountId`, falling back to the access token's OpenAI JWT claim. This internal API may change. API-key and missing credentials show `usage unavailable`; credentials are never refreshed, modified, or persisted by the footer.

Requests run outside rendering, only while Codex is selected, at most once a minute on the existing five-second tick. Credential changes invalidate old state. Requests coalesce, time out after ten seconds, and abort on provider changes/disposal. Failures back off exponentially and honor `Retry-After` up to one hour. A dimmed `~` marks retained stale usage; it expires after fifteen minutes or a reported reset. Authentication failures discard usage immediately. Snapshots are memory-only, with no credentials or quota files written to disk. Initial requests show `usage loading…`; missing usage never becomes a fabricated zero.

## Anthropic OMP subscription usage

When `anthropic-omp` is selected, the footer shows account-wide `5h` and `7d` used percentages and reset dates instead of session/week dollar estimates. Context usage remains separate; other Anthropic providers retain their existing cost display. Missing usage shows `usage unavailable`, never dollar estimates or a fabricated zero.

The footer checks Pi's non-secret OMP login marker and requests sanitized usage through the provider's existing event/stdio bridge. Real credentials stay in the OMP backend. The backend uses the fork's existing usage API, cache, and coordinated OAuth refresh; no vendor code is changed. It reads the session's active subscription account without selecting or rotating accounts. Before a session has selected an account, a sole stored account can be shown; multiple unselected accounts show unavailable rather than guessing or combining allowances. Only the shared five-hour and seven-day limits are displayed, not extra-usage billing or model-specific limits.

Polling occurs outside rendering at most once per minute, with a twelve-second caller timeout and exponential failure backoff up to fifteen minutes. Provider changes, logout, and disposal cancel pending footer requests. The backend bounds its shared upstream lookup separately to ten seconds. Cached reports older than six minutes are marked `~`; reports older than fifteen minutes or expired windows are discarded. Failed lookups clear displayed usage so an old account's values are not retained. No credentials or new quota cache files are written by the footer; OMP maintains its own existing cache/history and token lifecycle.

## OpenRouter balance

When `openrouter` is selected, the footer shows `balance $42.18 | session $0.37` instead of session/week totals. Balance is the account-wide `total_credits - total_usage` returned by `GET https://openrouter.ai/api/v1/credits`, not a key-specific allowance or percentage. An API key with no spending limit can use the account balance; it does not have unlimited funds. Zero and negative balances are retained and colored red. Session remains Pi's local estimated session cost (including mixed-provider history); the weekly figure is omitted. Narrow terminals use `bal` and `s` labels.

**Authentication:** [OpenRouter's credits API documentation](https://openrouter.ai/docs/api/api-reference/credits/get-credits) currently specifies a management key. Optionally set `OPENROUTER_MANAGEMENT_KEY` in Pi's environment to a management key **for the same account as your inference key**. This credential is used only for the read-only credits request, never inference, and is not written to disk. Do not paste keys into chat. Without this override, the footer tries the resolved OpenRouter provider API key via `ctx.modelRegistry.getProviderAuth`, supporting Pi's configured/env-backed credentials. If the key lacks permission, the footer shows `balance unavailable`; it never treats a null key limit as a balance. The footer cannot verify that a separately supplied management key belongs to the inference account.

Fetching is nonblocking and occurs only while OpenRouter is selected. Keys are resolved on each five-second tick; successful balance fetches are limited to once a minute. Requests coalesce, time out after ten seconds (including waiting for key resolution), and are aborted on provider changes or disposal. Failures use exponential backoff and honor `Retry-After` up to one hour. Initial state is `balance loading…`. Transient errors retain the last value as dimmed `balance ~$42.18` for at most fifteen minutes; authentication/permission failures or unresolvable credentials discard it immediately. Credential changes invalidate old balances. State is memory-only; no balance or key cache files are written.

## Tests

From `~/.pi`, with Node 24 or newer:

```sh
node --test agent/tests/statusbar/*.test.ts
```

Tests use temporary directories and mocked lifecycle events. They do not modify real session logs or the legacy weekly snapshots.
