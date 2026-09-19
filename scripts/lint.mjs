#!/usr/bin/env node
/**
 * Lint for the intely-agent-skills repo. No dependencies; run with `node scripts/lint.mjs`.
 *
 * Checks:
 *   - every skills/<name>/SKILL.md has frontmatter with a valid `name` (matching its directory)
 *     and a non-empty `description`, per the Agent Skills spec (agentskills.io/specification)
 *   - the skill body stays a router: at most MAX_BODY_LINES lines and it names both guide tools
 *   - relative links in SKILL.md resolve to files in the repo
 *   - the plugin manifests (root plugin.json, .claude-plugin/plugin.json, .codex-plugin/plugin.json)
 *     parse and carry the same name, version, and description
 *   - both marketplace files reference that plugin by name and point at the repo root
 *   - manifests that declare a skills path point at the directory holding the skills
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY_LINES = 40;
const REQUIRED_TOOL_MENTIONS = ['listGuides', 'getGuide'];
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;

const MANIFESTS = ['plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json'];
const CLAUDE_MARKETPLACE = '.claude-plugin/marketplace.json';
const CODEX_MARKETPLACE = '.agents/plugins/marketplace.json';

const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

const readJson = (relative) => {
    if (!exists(relative)) {
        fail(relative, 'file is missing');
        return undefined;
    }
    try {
        return JSON.parse(read(relative));
    } catch (error) {
        fail(relative, `invalid JSON: ${error.message}`);
        return undefined;
    }
};

/** Minimal YAML frontmatter parser: `key: value` scalars plus `>` / `|` block scalars. */
const parseFrontmatter = (source) => {
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const result = {};
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (!line.trim() || line.trimStart().startsWith('#')) continue;
        const match = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(line);
        if (!match) throw new Error(`unsupported frontmatter line: "${line}"`);
        const key = match[1];
        let value = (match[2] ?? '').trim();
        if (['>', '|', '>-', '|-'].includes(value)) {
            const block = [];
            while (index + 1 < lines.length && (/^\s+\S/.test(lines[index + 1]) || !lines[index + 1].trim())) {
                block.push(lines[++index].trim());
            }
            value = block.join(value.startsWith('>') ? ' ' : '\n').trim();
        } else if (/^(['"]).*\1$/.test(value)) {
            value = value.slice(1, -1);
        }
        result[key] = value;
    }
    return result;
};

const lintSkill = (skillDir) => {
    const file = path.posix.join('skills', skillDir, 'SKILL.md');
    if (!exists(file)) {
        fail(file, 'file is missing');
        return;
    }
    const source = read(file);
    const match = FRONTMATTER_RE.exec(source);
    if (!match) {
        fail(file, 'missing YAML frontmatter block (--- ... ---) at the top of the file');
        return;
    }

    let frontmatter;
    try {
        frontmatter = parseFrontmatter(match[1]);
    } catch (error) {
        fail(file, error.message);
        return;
    }

    const { name, description } = frontmatter;
    if (!name) {
        fail(file, 'frontmatter is missing `name`');
    } else {
        if (name.length > 64) fail(file, '`name` must be at most 64 characters');
        if (!SKILL_NAME_RE.test(name)) {
            fail(file, '`name` must be lowercase letters, digits, and single hyphens, not starting or ending with a hyphen');
        }
        if (name !== skillDir) fail(file, `\`name\` (${name}) must match the directory name (${skillDir})`);
    }
    if (!description) fail(file, 'frontmatter is missing `description`');
    else if (description.length > 1024) fail(file, '`description` must be at most 1024 characters');

    const body = match[2].replace(/\r\n/g, '\n').replace(/\s+$/, '');
    const bodyLines = body ? body.split('\n').length : 0;
    if (bodyLines === 0) fail(file, 'body is empty');
    if (bodyLines > MAX_BODY_LINES) {
        fail(
            file,
            `body is ${bodyLines} lines; the limit is ${MAX_BODY_LINES}. This skill is a router: domain content belongs in a server-side guide`,
        );
    }
    for (const tool of REQUIRED_TOOL_MENTIONS) {
        if (!body.includes(tool)) fail(file, `body must tell the agent to call \`${tool}\``);
    }

    const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
    for (const [, target] of body.matchAll(linkRe)) {
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const resolved = path.posix.normalize(path.posix.join('skills', skillDir, target.split('#')[0]));
        if (!exists(resolved)) fail(file, `link target does not exist: ${target}`);
    }
};

const lintCodexInterface = (file, iface) => {
    if (!iface || typeof iface !== 'object') {
        fail(file, 'missing `interface` object (required by Codex)');
        return;
    }
    for (const key of ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category']) {
        if (typeof iface[key] !== 'string' || !iface[key].trim()) fail(file, `missing \`interface.${key}\``);
    }
    if (!Array.isArray(iface.capabilities)) fail(file, '`interface.capabilities` must be an array');
    for (const key of ['websiteURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
        if (iface[key] !== undefined && !/^https:\/\//.test(iface[key])) {
            fail(file, `\`interface.${key}\` must be an absolute https URL`);
        }
    }
    if (iface.defaultPrompt !== undefined) {
        if (!Array.isArray(iface.defaultPrompt) || iface.defaultPrompt.length > 3) {
            fail(file, '`interface.defaultPrompt` must be an array of at most 3 strings');
        } else {
            for (const prompt of iface.defaultPrompt) {
                if (typeof prompt !== 'string' || prompt.length > 128) {
                    fail(file, '`interface.defaultPrompt` entries must be strings of at most 128 characters');
                }
            }
        }
    }
    for (const key of ['composerIcon', 'logo', 'logoDark']) {
        if (iface[key] !== undefined && !exists(iface[key])) {
            fail(file, `\`interface.${key}\` points at a missing file: ${iface[key]}`);
        }
    }
};

const lintManifests = () => {
    const manifests = MANIFESTS.map((file) => ({ file, json: readJson(file) })).filter((entry) => entry.json);
    if (manifests.length === 0) return;

    for (const { file, json } of manifests) {
        for (const key of ['name', 'version', 'description']) {
            if (typeof json[key] !== 'string' || !json[key].trim()) fail(file, `missing or empty \`${key}\``);
        }
        if (json.version && !SEMVER_RE.test(json.version)) fail(file, `\`version\` (${json.version}) is not semver`);
        if (!json.author?.name) fail(file, 'missing `author.name`');
        if (json.skills !== undefined) {
            if (typeof json.skills !== 'string') {
                fail(file, '`skills` must be a string path');
            } else if (path.posix.normalize(json.skills).replace(/\/$/, '') !== 'skills') {
                fail(file, `\`skills\` (${json.skills}) must point at ./skills/`);
            }
        }
    }

    const [reference, ...others] = manifests;
    for (const { file, json } of others) {
        for (const key of ['name', 'version', 'description']) {
            if (json[key] !== reference.json[key]) {
                fail(
                    file,
                    `\`${key}\` (${JSON.stringify(json[key])}) differs from ${reference.file} (${JSON.stringify(reference.json[key])})`,
                );
            }
        }
    }

    const codex = manifests.find((entry) => entry.file === '.codex-plugin/plugin.json');
    if (codex) lintCodexInterface(codex.file, codex.json.interface);

    const { name, version, description } = reference.json;

    const claude = readJson(CLAUDE_MARKETPLACE);
    if (claude) {
        if (!claude.name) fail(CLAUDE_MARKETPLACE, 'missing `name`');
        if (!claude.owner?.name) fail(CLAUDE_MARKETPLACE, 'missing `owner.name`');
        const entry = Array.isArray(claude.plugins) ? claude.plugins.find((plugin) => plugin.name === name) : undefined;
        if (!entry) {
            fail(CLAUDE_MARKETPLACE, `no plugins[] entry named "${name}"`);
        } else {
            if (entry.source !== './') {
                fail(CLAUDE_MARKETPLACE, `plugins[].source must be "./" (the plugin is the repo root), got ${JSON.stringify(entry.source)}`);
            }
            if (entry.version !== undefined && entry.version !== version) {
                fail(CLAUDE_MARKETPLACE, `plugins[].version (${entry.version}) differs from the plugin manifests (${version})`);
            }
            if (entry.description !== undefined && entry.description !== description) {
                fail(CLAUDE_MARKETPLACE, 'plugins[].description differs from the plugin manifests');
            }
        }
        if (claude.metadata?.version !== undefined && claude.metadata.version !== version) {
            fail(CLAUDE_MARKETPLACE, `metadata.version (${claude.metadata.version}) differs from the plugin manifests (${version})`);
        }
    }

    const codexMarket = readJson(CODEX_MARKETPLACE);
    if (codexMarket) {
        if (!codexMarket.name) fail(CODEX_MARKETPLACE, 'missing `name`');
        if (!codexMarket.interface?.displayName) fail(CODEX_MARKETPLACE, 'missing `interface.displayName`');
        const entry = Array.isArray(codexMarket.plugins)
            ? codexMarket.plugins.find((plugin) => plugin.name === name)
            : undefined;
        if (!entry) {
            fail(CODEX_MARKETPLACE, `no plugins[] entry named "${name}"`);
        } else {
            if (entry.source?.source !== 'local' || entry.source?.path !== './') {
                fail(CODEX_MARKETPLACE, 'plugins[].source must be { "source": "local", "path": "./" }');
            }
            if (!entry.policy?.installation || !entry.policy?.authentication) {
                fail(CODEX_MARKETPLACE, 'plugins[].policy needs `installation` and `authentication`');
            }
            if (!entry.category) fail(CODEX_MARKETPLACE, 'plugins[].category is missing');
        }
    }
};

const skillsDir = path.join(ROOT, 'skills');
const skillDirs = fs.existsSync(skillsDir)
    ? fs
          .readdirSync(skillsDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
    : [];
if (skillDirs.length === 0) fail('skills/', 'no skill directories found');
for (const skillDir of skillDirs) lintSkill(skillDir);
lintManifests();

if (errors.length > 0) {
    console.error(`Lint failed with ${errors.length} error(s):\n`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
}
console.log(`Lint passed: ${skillDirs.length} skill(s), ${MANIFESTS.length} manifests, 2 marketplaces.`);
