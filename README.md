# intely-agent-skills

A tiny [Agent Skill](https://agentskills.io) that teaches your AI coding agent to read Intely's
server-hosted guides before it builds anything in the [Intely](https://intely.io) platform.

The skill contains no Intely domain knowledge. It tells the agent to connect to the Intely MCP
server, call `listGuides`, call `getGuide` for the matching topic, and follow that guide. All
content stays on the server, so it never goes stale.

The same `skills/intely/SKILL.md` is read by every client that supports the Agent Skills format
(Claude Code, Claude Desktop, Codex, Cursor, GitHub Copilot, VS Code, Antigravity). Thin plugin
manifests are layered on top so each client's native plugin install also works.

## Why you might need this

The Intely MCP server already ships `instructions` that tell agents to read the guides first, and
every build tool's description points at its guide. Some clients ignore server instructions, and
some defer large tool lists so the agent never sees `listGuides` until it is already building.
This skill fixes that for those clients with one file.

Measured with a cold agent connected to the Intely MCP server and asked to "create a mapping from
A to B":

| Client | Injects server `instructions`? | Called `listGuides` unprompted? | Needs the skill? |
|---|---|---|---|
| Claude Code | Yes | Not yet measured | Not yet measured |
| Claude Desktop | Not yet measured | Not yet measured | Not yet measured |
| Claude.ai (web) | Not yet measured | Not yet measured | Not yet measured |
| ChatGPT | Not yet measured | Not yet measured | Not yet measured |
| ChatGPT Codex | Not yet measured | Not yet measured | Not yet measured |
| Antigravity | Not yet measured | Not yet measured | Not yet measured |
| Cursor | Not yet measured | Not yet measured | Not yet measured |
| Grok Build | Not yet measured | Not yet measured | Not yet measured |
| Copilot CLI | Not yet measured | Not yet measured | Not yet measured |
| VS Code (Copilot agent mode) | Not yet measured | Not yet measured | Not yet measured |

If your client is marked "No" in the last column you do not need this skill. Installing it anyway
is harmless.

## Prerequisite: connect the Intely MCP server

Add the Intely MCP server to your client as an HTTP server:

```
https://mcp.intely.io/mcp?organizationId=<organizationId>
```

Authentication is OAuth: the client opens a browser and you sign in with your Intely account.
Users who belong to exactly one organization may omit `organizationId`. The **Organization → MCP**
page in the Intely app shows the exact URL for your organization and the steps for each client.

## Install

### Claude Code

As a plugin, from the marketplace in this repo:

```
/plugin marketplace add intely-io/intely-agent-skills
/plugin install intely@intely-agent-skills
```

Or as a plain skill, for one machine:

```bash
git clone https://github.com/intely-io/intely-agent-skills.git /tmp/intely-agent-skills
mkdir -p ~/.claude/skills && cp -r /tmp/intely-agent-skills/skills/intely ~/.claude/skills/intely
```

For one project, copy `skills/intely/` to `.claude/skills/intely/` in the repo instead.

### Claude Desktop and Claude.ai

Open **Settings → Capabilities → Skills**, choose **Upload skill**, and upload the
`skills/intely/` folder (or a zip of it). The skill is available in every conversation that has
the Intely MCP connector enabled.

### Codex

Add the marketplace in this repo, then install the plugin from the `/plugins` browser inside
Codex:

```bash
codex plugin marketplace add intely-io/intely-agent-skills
```

Or install the skill directly, without the plugin layer, by copying `skills/intely/` to
`.agents/skills/intely/` in your project or `~/.agents/skills/intely/` for every project.

### Antigravity

The repo root is an Antigravity plugin bundle (`plugin.json` plus `skills/`):

```bash
agy plugin install https://github.com/intely-io/intely-agent-skills
agy plugin list
```

Or copy `skills/intely/` to `.agents/skills/intely/` in your workspace.

### Cursor

Copy `skills/intely/` to `.cursor/skills/intely/` in your project, or to `~/.cursor/skills/intely/`
for every project. Cursor also reads `.agents/skills/` and `~/.agents/skills/`.

### GitHub Copilot CLI and VS Code (Copilot agent mode)

Copy `skills/intely/` to `.github/skills/intely/` in your project, or to `~/.copilot/skills/intely/`
for every project. Both also read `.agents/skills/` and `~/.agents/skills/`.

### Everything else (Grok Build, older Cursor, clients with no skills mechanism)

Paste this into your project's `AGENTS.md`, `.cursor/rules`, or equivalent always-on
instructions file. It is the body of `skills/intely/SKILL.md`, verbatim:

```markdown
# Working with Intely

Intely's MCP server hosts up-to-date, step-by-step guides for every part of the platform.
Always read the guide before you build.

1. Confirm the Intely MCP server is connected. If it is not, tell the user to add
   `https://mcp.intely.io/mcp?organizationId=<organizationId>` as an HTTP MCP server. It uses
   OAuth: they sign in with their Intely account in the browser. Users who belong to exactly
   one organization may omit the query parameter.
2. Call `listGuides` to see the available topics.
3. Call `getGuide` with the topic that matches the task (for example `intely-mappings`) and
   follow it. Read a second guide if the task spans areas (a mapping that needs a new data type).
4. Only then call the Intely build tools, in the order the guide describes.

Never invent Intely IDs, field names, or ObjectIds. Look them up with the read tools the guide
names. If a guide and a tool description disagree, trust the guide and tell the user.
```

## Verify it works

Start a fresh session with the Intely MCP server connected and ask for something concrete, for
example "create a mapping from my Patient data type to FHIR Patient". Before touching any build
tool the agent should call `listGuides`, then `getGuide` with `intely-mappings`. If it skips
straight to `createMapping`, the skill is not loaded; check the install path for your client.

## Repo layout

```
skills/intely/SKILL.md            the router skill; the only file with content
plugin.json                       root plugin manifest (Antigravity bundle, Codex portable layout)
.claude-plugin/plugin.json        Claude Code plugin manifest
.claude-plugin/marketplace.json   Claude Code marketplace (also read by Codex as a legacy source)
.codex-plugin/plugin.json         Codex plugin manifest
.agents/plugins/marketplace.json  Codex marketplace
.github/workflows/lint.yaml       CI: runs scripts/lint.mjs
scripts/lint.mjs                  frontmatter, body length, links, manifest consistency
```

All manifests carry the same `name`, `version`, and `description`. CI fails if they drift, if the
skill frontmatter is missing `name` or `description`, or if the skill body grows past 40 lines.

## Maintenance

- The only coupling to the Intely server is the server URL and the two tool names, `listGuides`
  and `getGuide`. Both are stable.
- Releases are git tags. Bump `version` in every manifest together (`plugin.json`,
  `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`)
  and tag the commit with the same version.
- Do not add Intely domain rules to `SKILL.md`. If you are tempted to, it belongs in a server-side
  guide.
- Run the lint locally with `node scripts/lint.mjs` (Node 22 or newer, no dependencies).

## Contributing

Pull requests are welcome. The repo is public and read-only; open a PR from a fork and a
maintainer will review it. CI must pass.

## License

[MIT](LICENSE)
