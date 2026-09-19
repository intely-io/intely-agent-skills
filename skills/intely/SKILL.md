---
name: intely
description: Use whenever the user asks to build, change, debug, or understand anything in the Intely platform (data types, mappings, crosswalks, apps, app instances, integrations, projects) or mentions the Intely MCP server. Teaches the agent to read Intely's server-hosted guides before acting.
license: MIT
---

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
