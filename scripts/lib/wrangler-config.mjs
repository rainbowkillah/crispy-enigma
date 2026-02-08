import { readFileSync } from 'node:fs';

const ENV_ALIASES = {
  dev: ['dev', 'develop', 'development'],
  staging: ['staging', 'stg', 'preview'],
  production: ['production', 'prod', 'prd']
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const isEscaped = (input, index) => {
  let count = 0;
  for (let i = index - 1; i >= 0 && input[i] === '\\\\'; i -= 1) {
    count += 1;
  }
  return count % 2 === 1;
};

export const stripJsonComments = (input) => {
  let output = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (char === '"' && !isEscaped(input, i)) {
      inString = !inString;
      output += char;
      continue;
    }

    if (!inString && char === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (!inString && char === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }

    output += char;
  }

  return output;
};

export const loadWranglerConfig = (configPath) => {
  const raw = readFileSync(configPath, 'utf8');
  return JSON.parse(stripJsonComments(raw));
};

export const listEnvKeys = (config) => Object.keys(config?.env ?? {});

export const resolveEnvKey = (config, env) => {
  if (!env) {
    return { envKey: undefined, normalized: undefined, reason: 'not_provided' };
  }

  const envKeys = listEnvKeys(config);
  const envLower = env.toLowerCase();
  const exactMatch = envKeys.find((key) => key.toLowerCase() === envLower);
  if (exactMatch) {
    return { envKey: exactMatch, normalized: envLower, reason: 'exact' };
  }

  const aliasEntry = Object.entries(ENV_ALIASES).find(([, aliases]) =>
    aliases.includes(envLower)
  );
  if (!aliasEntry) {
    return { envKey: null, normalized: envLower, reason: 'missing' };
  }

  const [normalized, aliases] = aliasEntry;
  const aliasMatch = envKeys.find((key) => aliases.includes(key.toLowerCase()));
  if (aliasMatch) {
    return { envKey: aliasMatch, normalized, reason: 'alias' };
  }

  return { envKey: null, normalized, reason: 'missing' };
};

export const getEffectiveSection = (config, envKey, key) => {
  if (envKey && hasOwn(config?.env ?? {}, envKey)) {
    const envConfig = config.env?.[envKey];
    if (envConfig && hasOwn(envConfig, key)) {
      return envConfig[key];
    }
  }
  return config?.[key];
};
