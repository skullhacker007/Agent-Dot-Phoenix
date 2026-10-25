# CLAUDE.md

@AGENTS.md

Claude Code-specific operating rules for this repository. Shared project rules (stack, commands, security, scope, completion) are defined in `AGENTS.md` and apply in full. Optimize for correct results with the fewest tool calls and the smallest outputs.

**Priority:** Correctness > Security > Reliability > Minimal change > Speed > Token cost. Never sacrifice the first three to save tokens.

## 1. Tool Usage

- Answer from existing context first. Exception: installed-version APIs (Next.js, Prisma, MUI) must be verified in installed docs or types, not from memory.
- Batch independent reads, searches, and commands into one turn, using parallel calls or a single shell command joined with `&&`.
- Do not repeat a command or reread a file unless it changed or the earlier result was incomplete.
- Start with the most likely file or folder. Do not scan the whole repository or list full directory trees.
- Do not start subagents.
- On error, read the message, fix the cause, and retry once. Stop after two failed attempts and report the blocker.
- For usage, token, or cost questions, direct the user to `/cost` or `/usage`. Do not search transcripts or write scripts.

## 2. File Reading

- Locate with Grep or Glob, then Read only the required lines using offset and limit.
- Never read whole large or generated files: logs, lockfiles, build output, minified files, `node_modules`, `.git`, `.next`.
- Skip files unrelated to the task.

## 3. Command Output

- Bound output with `| head -n 50`, `| tail -n 30`, `grep -c`, `grep -l`, `--stat`, `--oneline`, or `-q`.
- For builds, tests, installs, and migrations, run `cmd > /tmp/out.log 2>&1; echo "exit=$?"`, then show only errors, failures, and the summary line.
- If bounded output hides the cause of a failure, fetch the specific relevant section. Never guess without the error text.

## 4. Replies

- Lead with the result. No recap of steps, restating of the question, or filler.
- Keep replies to one sentence or a few bullets. Show only changed code, never whole files.
- State what changed and where (file:line), plus any failure or decision required from the user.
- Simple tasks: no plan or narration. Larger tasks: a plan of at most 5 short lines.
- Ask one short question only when blocked; otherwise choose a sensible default and state it in one line.
- Stop when the task is complete and verified. Do not suggest extras unless important.

## 5. Database and MCP (Neon)

- Use database tools only for database-related tasks.
- Select only the required columns and add `LIMIT`.
- List or describe only the specific project, branch, or table needed.
- Destructive operations require explicit user confirmation.

## 6. Non-Negotiables

- Never skip required verification, input validation, error handling, or secret protection to save tokens.
- When unsure whether a check is required, run it.

Current task instructions override this file, except Security requirements and destructive-operation safeguards defined in `AGENTS.md`.
