---
name: plan-to-issues
description: Split this repo's plan.md into GitHub issues with gh, one per unit of work, after a human has reviewed the split. Use when a plan is ready and has no issues yet.
---

# plan-to-issues

Turns `plan.md` into GitHub issues that workers can pick up cold. Easiest with `gh`, authenticated,
in a shell this agent can run.

## Steps

1. Read `plan.md`, `AGENTS.md` and `docs/adr/`.
2. Draft the split as a table: title · plan section · scope · done when · blocked by.
   One issue per unit of work.
3. **Stop and show the table to the human.** Publish nothing until they approve it.
4. Fill every issue from **Issue shape** below. Ask the human only to change that shape; when they
   do, update this file in the same change.
5. Create each issue in dependency order, so blocked-by can cite real numbers:

   ```sh
   gh issue create --title "<title>" --body-file <tmp.md>
   ```

6. Record every issue URL from gh's output (not from memory) and reply with the list.

Closing one, with the closing comment from AGENTS.md:

```sh
gh issue close <n> -c "<closing comment>"
```

## Issue shape

Every issue in this repo carries exactly this body, decided by the human on 2026-10-29:

```md
Source: plan.md § <section number, e.g. 2a>
Scope: <what this issue changes, from the plan, in the plan's words>
Done when: <the plan's done line>
Blocked by: <#n, …> or —
Worker model: <Opus | Sonnet | Haiku>
```

- Label: `plan:<plan name from plan.md frontmatter>`, e.g. `plan:morning-digest`. Create it once
  with `gh label create` if it is missing.
- `Source:` is the first line, always: the reviewer sorts issues by it.
- `Done when` for a step that hands something to a person (a reviewer, a customer) names *their*
  act: "the reviewer has looked at the preview", not "the link is sent", even when the plan's
  line says "sent". Mark that change in the table you show the human. The issue stays open until then.
- Worker model: the strongest for logic, a cheaper one for views and tests (AGENTS.md).

## No `gh`

Steps 1–4 hold either way. GitHub reachable another way (a connector, the REST API, the web UI):
the same issues, made that way. GitHub issues out of reach altogether: write them as files in
`docs/issues/`, format in ADR 0004, then commit and push.

## Don'ts

- Don't paste the whole plan into one issue, and don't keep issues only in chat.
- Don't invent sections the plan doesn't have. If the plan is unclear, ask.
