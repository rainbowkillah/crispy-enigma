import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const tenantsDir = resolve('tenants');
const entries = await readdir(tenantsDir, { withFileTypes: true });

const tenantDirs = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => !name.startsWith('.') && name !== 'node_modules');

const imports = [];
const exports = [];
const warnings = [];

for (const name of tenantDirs) {
  const configPath = resolve(tenantsDir, name, 'tenant.config.json');
  const wranglerPath = resolve(tenantsDir, name, 'wrangler.jsonc');
  try {
    await readFile(configPath, 'utf-8');
    const varName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    imports.push(`import ${varName} from './${name}/tenant.config.json';`);
    exports.push(varName);
  } catch {
    warnings.push(`${name}: missing tenant.config.json`);
    continue;
  }

  try {
    await readFile(wranglerPath, 'utf-8');
  } catch {
    warnings.push(`${name}: missing wrangler.jsonc`);
  }
}

const output = `${imports.join('\n')}
\nexport const tenantConfigs = [${exports.join(', ')}];\n`;

await writeFile(resolve('tenants/index.ts'), output);
console.log(`Generated tenants/index.ts with ${exports.length} tenants.`);
if (warnings.length > 0) {
  console.warn('Tenant validation warnings:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}
