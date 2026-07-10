export function parseArgs(argv, config = {}) {
  const valueOptions = new Set(config.valueOptions ?? []);
  const booleanOptions = new Set(config.booleanOptions ?? []);
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith("--") || token === "--") {
      positionals.push(token);
      continue;
    }

    const [name, inlineValue] = token.slice(2).split("=", 2);
    if (booleanOptions.has(name)) {
      options[name] = inlineValue === undefined ? true : inlineValue !== "false";
      continue;
    }

    if (valueOptions.has(name)) {
      const value = inlineValue ?? argv[index + 1];
      if (value === undefined) {
        throw new Error(`Missing value for --${name}.`);
      }
      options[name] = value;
      if (inlineValue === undefined) {
        index += 1;
      }
      continue;
    }

    positionals.push(token);
  }

  return { options, positionals };
}

export function splitRawArgumentString(raw) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaping = false;

  for (const character of raw) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }
    if (character === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }

  if (escaping) {
    current += "\\";
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}
