import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const messagesRoot = "messages";
const sourceLocale = "zh-CN";
const sourceDir = join(messagesRoot, sourceLocale);
const messageNamespaceConfigFile = "src/i18n/message-namespaces.ts";
const placeholderPattern = /\{\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:,|\})/g;

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${filePath}: ${error.message}`);
  }
}

function listLocaleDirs() {
  return readdirSync(messagesRoot)
    .filter((entry) => statSync(join(messagesRoot, entry)).isDirectory())
    .sort();
}

function listNamespaceFiles(locale) {
  return readdirSync(join(messagesRoot, locale))
    .filter((entry) => entry.endsWith(".json"))
    .sort();
}

function listConfiguredNamespaces() {
  const content = readFileSync(messageNamespaceConfigFile, "utf8");
  const namespacesMatch = content.match(/MESSAGE_NAMESPACES\s*=\s*\[([\s\S]*?)\]/);
  if (!namespacesMatch) {
    throw new Error(`${messageNamespaceConfigFile}: MESSAGE_NAMESPACES array was not found`);
  }

  return [...namespacesMatch[1].matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectLeafStrings(value, prefix = "") {
  if (typeof value === "string") {
    return new Map([[prefix, value]]);
  }

  if (!isPlainObject(value)) {
    return new Map();
  }

  const entries = new Map();
  for (const key of Object.keys(value).sort()) {
    const childPrefix = prefix ? `${prefix}.${key}` : key;
    for (const [childKey, childValue] of collectLeafStrings(value[key], childPrefix)) {
      entries.set(childKey, childValue);
    }
  }

  return entries;
}

function collectPlaceholders(message) {
  const placeholders = new Set();
  for (const match of message.matchAll(placeholderPattern)) {
    placeholders.add(match[1]);
  }

  return [...placeholders].sort();
}

function compareSets(label, expected, actual, errors) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  for (const value of expected) {
    if (!actualSet.has(value)) {
      errors.push(`${label}: missing ${value}`);
    }
  }
  for (const value of actual) {
    if (!expectedSet.has(value)) {
      errors.push(`${label}: extra ${value}`);
    }
  }
}

function compareNamespace(locale, namespaceFile, errors) {
  const namespace = namespaceFile.replace(/\.json$/, "");
  const sourceMessages = collectLeafStrings(readJsonFile(join(sourceDir, namespaceFile)));
  const targetMessages = collectLeafStrings(readJsonFile(join(messagesRoot, locale, namespaceFile)));
  const sourceKeys = [...sourceMessages.keys()].sort();
  const targetKeys = [...targetMessages.keys()].sort();

  compareSets(`${locale}/${namespace}`, sourceKeys, targetKeys, errors);

  for (const key of sourceKeys) {
    if (!targetMessages.has(key)) {
      continue;
    }

    const sourcePlaceholders = collectPlaceholders(sourceMessages.get(key));
    const targetPlaceholders = collectPlaceholders(targetMessages.get(key));
    compareSets(`${locale}/${namespace}.${key} placeholders`, sourcePlaceholders, targetPlaceholders, errors);
  }
}

const errors = [];
const sourceNamespaces = listNamespaceFiles(sourceLocale);
const sourceNamespaceNames = sourceNamespaces.map((namespaceFile) => namespaceFile.replace(/\.json$/, ""));
const locales = listLocaleDirs();
const configuredNamespaces = listConfiguredNamespaces();

if (!locales.includes(sourceLocale)) {
  errors.push(`Missing source locale directory: ${sourceDir}`);
}

compareSets("message namespace config", sourceNamespaceNames, configuredNamespaces, errors);

for (const locale of locales) {
  const localeNamespaces = listNamespaceFiles(locale);
  compareSets(`${locale} namespaces`, sourceNamespaces, localeNamespaces, errors);

  for (const namespaceFile of sourceNamespaces) {
    if (localeNamespaces.includes(namespaceFile)) {
      compareNamespace(locale, namespaceFile, errors);
    }
  }
}

if (errors.length > 0) {
  console.error("i18n message check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`i18n message check passed for ${locales.length} locales and ${sourceNamespaces.length} namespaces.`);
