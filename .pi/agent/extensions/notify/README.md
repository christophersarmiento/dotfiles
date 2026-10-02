# Terminal notifications

`../notify.ts` is the Pi extension entry point. Requires the `agent_settled`, `ui_prompt_start`, and `ctx.mode` APIs available in Pi 0.85.1.

## Defaults

- Notify after the agent has fully settled, not between automatic retries, compaction, or queued continuations.
- Notify when an extension opens a blocking confirmation, selection, or input UI.
- Give a best-effort heads-up for risky commands sent through `bash` or `hypa_shell`. This does **not** request permission or block execution.
- Hide command previews. Prompt titles and model error messages are also omitted to avoid exposing their contents in Notification Center.
- Suppress identical notifications of the same kind for five seconds. A risky-command alert cannot suppress a prompt or completion. Closing a prompt resets its cooldown so the next prompt always gets an alert.
- Include the project directory name and session name (or a short session ID) in the title. These labels are visible in Notification Center.
- Report failed or length-limited runs differently; do not notify for explicitly aborted runs.
- Do nothing outside the interactive TUI or when stdout is not a terminal.

## Commands

Run `/reload` after installing or changing the extension.

| Command | Effect |
| --- | --- |
| `/notify` or `/notify status` | Show settings and the detected backend |
| `/notify test` | Send a test in three seconds, giving you time to switch away |
| `/notify on` / `/notify off` | Enable or disable automatic notifications |
| `/notify completion on` / `off` | Toggle settled-run notifications |
| `/notify prompts on` / `off` | Toggle blocking-prompt notifications |
| `/notify risky on` / `off` | Toggle risky-command warnings |
| `/notify previews on` / `off` | Include or hide raw command previews |
| `/notify cooldown 5` | Set duplicate cooldown in seconds (0–3600; up to three decimal places) |
| `/notify reset` | Restore defaults |

Settings are saved **per session**, survive `/reload` and resuming that session, and are not included in model context. New sessions use the defaults. Settings are session preferences, so navigating `/tree` does not roll them back.

A test bypasses notification toggles and cooldown, but still requires an interactive TUI and a supported terminal. Scheduling another test replaces the pending test. `/notify off` and session shutdown/reload cancel pending tests.

## Terminal support

| Terminal | Detection | Backend |
| --- | --- | --- |
| Ghostty | `TERM_PROGRAM=ghostty` | OSC 777, separate title and body |
| iTerm2 | `TERM_PROGRAM=iTerm.app` | OSC 9, combined title and body |
| WezTerm | `TERM_PROGRAM=WezTerm` | OSC 777 |
| Kitty | `KITTY_WINDOW_ID` or `TERM=xterm-kitty` | OSC 99, unique notification ID |
| Windows Terminal | `WT_SESSION` | PowerShell toast with escaped data and a five-second timeout |

Unknown terminals are intentionally ignored rather than receiving an arbitrary escape sequence. Windows delivery is best-effort and requires PowerShell and working Windows toast support; it has not been tested on Windows.

Terminal notification requests are not delivery acknowledgements. On macOS, allow notifications for Ghostty/iTerm2 in System Settings and check the terminal's notification settings and Focus mode. Some terminals suppress notifications while their window is focused; `/notify test` gives you three seconds to switch away.

No terminal-focus tracking or automatic tmux/screen passthrough is installed. SSH and multiplexers may require environment forwarding and terminal-specific passthrough configuration.

## Risk detection limits

The matcher recognizes common shell words, quotes, escapes, comments, command separators, direct download-to-shell pipelines, common Git global options, split/combined `rm` flags, shell `-c` strings, and basic Hypa wrappers. SQL `DROP TABLE` / `DROP DATABASE` matching is limited to common SQL clients (`psql`, `mysql`, `mariadb`, `sqlite3`, `sqlcmd`).

It is **not a shell parser or security boundary**. It cannot reliably analyze aliases, shell functions, expansions, here-documents, arbitrary wrappers, complex control flow, scripts loaded from files, or commands hidden inside MCP/JavaScript tools. It never executes a command to inspect it.

## Tests

From `~/.pi` with Node 24:

```sh
node --test agent/tests/notify/*.test.ts
```

The tests use captured notification requests and mocked timers, not real desktop notifications. Actual banner delivery still needs the manual `/notify test` check in each terminal.
