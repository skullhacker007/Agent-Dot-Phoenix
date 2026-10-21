# Token Efficiency Rules

Every tool call re-sends the whole conversation context. Fewer calls and smaller outputs save the most tokens. Correctness and security always come first.

## 1. Tool calls
1. Answer from existing context or knowledge first. Use a tool only when the answer needs it.
2. Batch independent reads, searches, and commands into one turn (parallel calls, or one shell command joined with `&&`).
3. Do not repeat a command or reread a file unless it changed or the earlier result was incomplete.
4. Start with the most likely file or folder. Do not scan the whole repo or list whole directory trees.
5. Do not start subagents. Do not retry blindly: read the error, fix the cause, then retry once.
6. For questions about usage, tokens, or cost, tell the user to run `/cost` or `/usage`. Do not search transcript files or write scripts for it.

## 2. Reading files
7. Locate first with Grep or Glob, then Read only the needed lines using offset and limit.
8. Never `cat` or read a whole large file (logs, lockfiles, generated files, minified files, build output, `node_modules`, `.git`).
9. Skip files unrelated to the task.

## 3. Command output
10. Always bound output: `| head -n 50`, `| tail -n 30`, `grep -c`, `grep -l`, `--stat`, `--oneline`, `-q`.
11. For builds, tests, installs, and migrations: redirect to a log (`> /tmp/out.log 2>&1`), then show only errors, failures, and the final summary line.
12. If bounded output hides what is needed to diagnose an error, fetch the specific relevant section. Never dump everything, and never guess without the error text.
13. Do not print secrets, tokens, or `.env` contents.

## 4. Working style
14. Make the smallest correct change. Do not refactor, rename, or reformat code outside the task.
15. Run only validation relevant to the change (the affected test, lint, or type check), not the full suite, unless asked.
16. Do not plan or narrate for simple tasks. Just do them. For larger tasks, give a plan of at most 5 short lines.
17. Ask one short question only when truly blocked. Otherwise pick a sensible default and state it in one line.
18. Stop when the task is done and verified. Do not suggest extras unless they are important.

## 5. Replies
19. Lead with the result. No recap of steps, no restating the question, no filler.
20. Keep replies short: one sentence or a few bullets. Show code only for the changed part, not whole files.
21. State what changed and where (file and line), plus anything that failed or needs the user's decision.

## 6. Database and MCP tools (Neon)
22. Use database tools only when the task is about the database. Prefer the smallest query: select only needed columns and add `LIMIT`.
23. Never run destructive operations (delete, drop, reset, restore, rotate, revoke) without explicit user confirmation.
24. List or describe only the specific project, branch, or table needed. Do not list everything.

## 7. Never compromise
25. Keep required checks: test changed logic, handle errors, validate inputs, protect secrets.
26. Token savings must never cause skipped verification or unsafe changes. When unsure whether a check is required, run it.