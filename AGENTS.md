# AGENTS.md

Instructions for AI coding agents working in this repository. Keep changes correct, secure, and token-efficient.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Next.js docs: read efficiently

The block above is required, but do not read the whole docs folder.

1. Find the one relevant guide first: `ls node_modules/next/dist/docs/ | head -n 50`, or `grep -ril "<topic>" node_modules/next/dist/docs/ | head -n 10`.
2. Read only that guide, and only the needed section (use offset and limit).
3. Do this once per topic per session. Reuse what you already learned.
4. If the task does not touch a Next.js API (routing, caching, data fetching, config, metadata, server actions), no docs lookup is needed.

## Token efficiency

Every tool call re-sends the whole conversation, so fewer calls and smaller outputs save the most. Correctness and security always come first.

### Tool calls
1. Answer from existing context or knowledge first. Use a tool only when the answer needs it.
2. Batch independent reads, searches, and commands into one turn (parallel calls, or one shell command joined with `&&`).
3. Do not repeat a command or reread a file unless it changed or the earlier result was incomplete.
4. Start with the most likely file or folder. Do not scan the whole repo or list full directory trees.
5. Do not start subagents. Do not retry blindly: read the error, fix the cause, then retry once.
6. For usage, token, or cost questions, tell the user to run `/cost` or `/usage`. Do not search transcript files or write scripts for it.

### Reading files
7. Locate with Grep or Glob, then Read only the needed lines using offset and limit. Prefer targeted reads and short summaries over full files.
8. Never read whole large or generated files: logs, lockfiles, `.next/`, `node_modules/`, `dist/`, `.git/`, minified files, build output.
9. Skip files unrelated to the task.

### Command output
10. Always bound output: `| head -n 50`, `| tail -n 30`, `grep -c`, `grep -l`, `--stat`, `--oneline`, `-q`.
11. For large output (builds, tests, installs, migrations): save it to a temporary log (`cmd > /tmp/out.log 2>&1; echo "exit=$?"`), then extract only errors, warnings, failures, and the final summary line.
12. If bounded output hides what is needed to diagnose an error, fetch the specific relevant section. Never dump everything, and never guess without the error text.
13. For shell pipelines, check the exit status of the original command, not the last one. A successful `tail`, `head`, or `grep` does not prove the command before it succeeded. Use `set -o pipefail`, `${PIPESTATUS[@]}`, or redirect to a log and read `$?`. Truncated output is never proof of success.
14. Never print secrets, tokens, or `.env` contents.

### Working style
15. Make the smallest correct change. Do not refactor, rename, or reformat code outside the task.
16. Run only validation relevant to the change (affected test, lint, or type check), not the full suite, unless asked.
17. Do not plan or narrate for simple tasks. For larger tasks, give a plan of at most 5 short lines.
18. Ask one short question only when truly blocked. Otherwise pick a sensible default and state it in one line.
19. Stop when the task is done and verified. Do not suggest extras unless important.

### Replies
20. Lead with the result. No step recap, no restating the question, no filler.
21. Keep replies to one sentence or a few bullets. Show only the changed code, not whole files.
22. State what changed and where (file and line), plus anything that failed or needs the user's decision.

### Session hygiene
23. Keep unrelated tasks out of the current conversation. When the user switches to a different task, suggest `/clear` (or `/compact` if context is still needed) and carry over only the requirements and decisions the new task needs.

## Database and MCP tools (Neon)

24. Use database tools only when the task is about the database. Select only needed columns and add `LIMIT`.
25. Never run destructive operations (delete, drop, reset, restore, rotate, revoke) without explicit user confirmation.
26. List or describe only the specific project, branch, or table needed. Do not list everything.

## Never compromise

27. Keep required checks: test changed logic, handle errors, validate inputs, protect secrets.
28. Token savings must never cause skipped verification or unsafe changes. When unsure whether a check is required, run it.