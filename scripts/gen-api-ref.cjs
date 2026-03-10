#!/usr/bin/env node
// Auto-generate API_REFERENCE.md from source
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// 1. Extract CLI commands from cli.ts
function extractCliCommands() {
  const cli = fs.readFileSync(path.join(SRC, 'cli.ts'), 'utf8');
  const lines = cli.split('\n');
  const commands = [];
  let currentCmd = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match .command("name") patterns
    const cmdMatch = line.match(/\.command\(["']([^"']+)["']\)/);
    if (cmdMatch) {
      if (currentCmd) commands.push(currentCmd);
      currentCmd = { name: cmdMatch[1], description: '', options: [], line: i + 1 };
      
      // Check for .description() on same line or next few lines
      const descMatch = line.match(/\.description\(["']([^"']+)["']\)/);
      if (descMatch) currentCmd.description = descMatch[1];
    }
    
    if (currentCmd && !currentCmd.description) {
      const descMatch = line.match(/\.description\(["']([^"']+)["']\)/);
      if (descMatch) currentCmd.description = descMatch[1];
    }
    
    // Match .option() patterns
    if (currentCmd) {
      const optMatch = line.match(/\.option\(["']([^"']+)["']\s*,\s*["']([^"']+)["']/);
      if (optMatch) {
        currentCmd.options.push({ flag: optMatch[1], desc: optMatch[2] });
      }
    }
  }
  if (currentCmd) commands.push(currentCmd);
  return commands;
}

// 2. Extract config types
function extractConfigTypes() {
  const configFile = fs.readFileSync(path.join(SRC, 'config', 'configTypes.ts'), 'utf8');
  return configFile;
}

// 3. Extract assurance packs
function extractAssurancePacks() {
  const packsDir = path.join(SRC, 'assurance', 'packs');
  const files = fs.readdirSync(packsDir).filter(f => f.endsWith('.ts') && f !== 'index.ts');
  const packs = [];
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(packsDir, file), 'utf8');
      // Extract pack id/name
      const idMatch = content.match(/id:\s*["']([^"']+)["']/);
      const nameMatch = content.match(/name:\s*["']([^"']+)["']/);
      const descMatch = content.match(/description:\s*["']([^"']+)["']/);
      const categoryMatch = content.match(/category:\s*["']([^"']+)["']/);
      
      // Extract assertions/checks
      const assertions = [];
      const assertMatches = content.matchAll(/(?:id|assertionId|checkId):\s*["']([^"']+)["']/g);
      for (const m of assertMatches) {
        if (!assertions.includes(m[1])) assertions.push(m[1]);
      }
      
      packs.push({
        file,
        id: idMatch?.[1] || file.replace('.ts', ''),
        name: nameMatch?.[1] || file.replace('.ts', '').replace(/Pack$/, ''),
        description: descMatch?.[1] || '',
        category: categoryMatch?.[1] || '',
        assertions
      });
    } catch (e) {
      packs.push({ file, id: file.replace('.ts', ''), name: file, description: 'Parse error', assertions: [] });
    }
  }
  return packs;
}

// 4. Extract assurance schema
function extractAssuranceSchema() {
  try {
    const schema = fs.readFileSync(path.join(SRC, 'assurance', 'assuranceSchema.ts'), 'utf8');
    return schema;
  } catch { return ''; }
}

// Build the reference
const commands = extractCliCommands();
const configSource = extractConfigTypes();
const packs = extractAssurancePacks();
const schemaSource = extractAssuranceSchema();

// Group commands by parent
const groups = {};
for (const cmd of commands) {
  // Determine group from context (line number proximity to parent command definitions)
  groups[cmd.name] = groups[cmd.name] || [];
}

let md = `# AMC API Reference

> Auto-generated from source on ${new Date().toISOString().split('T')[0]}

## Table of Contents

- [CLI Commands](#cli-commands)
- [Configuration Options](#configuration-options)
- [Assurance Packs](#assurance-packs)
- [Assertion Schema](#assertion-schema)

---

## CLI Commands

AMC provides ${commands.length} CLI commands organized into subcommand groups.

| # | Command | Description |
|---|---------|-------------|
${commands.map((c, i) => `| ${i+1} | \`${c.name}\` | ${c.description} |`).join('\n')}

### Command Details

${commands.filter(c => c.options.length > 0).map(c => `#### \`amc ${c.name}\`

${c.description}

| Option | Description |
|--------|-------------|
${c.options.map(o => `| \`${o.flag}\` | ${o.desc} |`).join('\n')}
`).join('\n')}

---

## Configuration Options

\`\`\`typescript
${configSource}
\`\`\`

---

## Assurance Packs

AMC includes ${packs.length} assurance packs for comprehensive agent evaluation.

| # | Pack ID | Name | Category | Assertions |
|---|---------|------|----------|------------|
${packs.map((p, i) => `| ${i+1} | \`${p.id}\` | ${p.name} | ${p.category} | ${p.assertions.length} |`).join('\n')}

### Pack Details

${packs.filter(p => p.description || p.assertions.length > 0).map(p => `#### ${p.name}

- **ID:** \`${p.id}\`
- **File:** \`${p.file}\`
- **Category:** ${p.category || 'N/A'}
- **Description:** ${p.description || 'N/A'}
${p.assertions.length > 0 ? `- **Assertions:** ${p.assertions.map(a => `\`${a}\``).join(', ')}` : ''}
`).join('\n')}

---

## Assertion Schema

\`\`\`typescript
${schemaSource}
\`\`\`

---

*Generated by \`scripts/gen-api-ref.js\`*
`;

fs.writeFileSync(path.join(ROOT, 'docs', 'API_REFERENCE.md'), md);
console.log(`Written docs/API_REFERENCE.md`);
console.log(`  Commands: ${commands.length}`);
console.log(`  Packs: ${packs.length}`);
console.log(`  Config source: ${configSource.split('\n').length} lines`);
