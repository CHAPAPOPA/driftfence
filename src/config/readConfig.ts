import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getUnsafeDocumentGlobReason } from "../markdown/documentGlobs.js";
import { normalizePath } from "../paths/projectPaths.js";

export interface DriftFenceConfig {
  ignorePaths: Set<string>;
  ignoreEnvVars: Set<string>;
  ignorePackageScripts: Set<string>;
  documentGlobs?: string[];
  ignoreDocumentGlobs?: string[];
}

export interface ConfigIssue {
  type: "config";
  path: string;
  message: string;
}

export interface ReadConfigResult {
  config: DriftFenceConfig;
  issue?: ConfigIssue;
}

const configPath = "driftfence.config.json";

export async function readConfig(projectRoot: string): Promise<ReadConfigResult> {
  let rawConfig: string;

  try {
    rawConfig = await readFile(join(projectRoot, configPath), "utf8");
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return { config: emptyConfig() };
    }

    return {
      config: emptyConfig(),
      issue: {
        type: "config",
        path: configPath,
        message: `${configPath} could not be read: ${getErrorMessage(error)}`,
      },
    };
  }

  try {
    return parseConfig(JSON.parse(stripBom(rawConfig)));
  } catch (error) {
    return {
      config: emptyConfig(),
      issue: {
        type: "config",
        path: configPath,
        message: `${configPath} is not valid JSON: ${getErrorMessage(error)}`,
      },
    };
  }
}

function parseConfig(config: unknown): ReadConfigResult {
  const object = isRecord(config) ? config : {};
  const documentGlobsResult = readStringArrayField(
    object,
    "documentGlobs",
    false,
  );

  if ("message" in documentGlobsResult) {
    return invalidConfig(documentGlobsResult.message);
  }

  const ignoreDocumentGlobsResult = readStringArrayField(
    object,
    "ignoreDocumentGlobs",
    true,
  );

  if ("message" in ignoreDocumentGlobsResult) {
    return invalidConfig(ignoreDocumentGlobsResult.message);
  }

  const documentGlobs = documentGlobsResult.value;
  const ignoreDocumentGlobs = ignoreDocumentGlobsResult.value;
  const unsafePattern = findUnsafeDocumentPattern([
    ["documentGlobs", documentGlobs ?? []],
    ["ignoreDocumentGlobs", ignoreDocumentGlobs ?? []],
  ]);

  if (unsafePattern !== undefined) {
    return {
      config: emptyConfig(),
      issue: {
        type: "config",
        path: configPath,
        message:
          `${configPath} contains unsafe ${unsafePattern.field} pattern ` +
          `\`${unsafePattern.pattern}\`: ${unsafePattern.reason}.`,
      },
    };
  }

  return {
    config: {
      ignorePaths: stringSet(object.ignorePaths, normalizePath),
      ignoreEnvVars: stringSet(object.ignoreEnvVars),
      ignorePackageScripts: stringSet(object.ignorePackageScripts),
      ...(documentGlobs === undefined
        ? {}
        : { documentGlobs: documentGlobs.map(normalizePath) }),
      ...(ignoreDocumentGlobs === undefined
        ? {}
        : { ignoreDocumentGlobs: ignoreDocumentGlobs.map(normalizePath) }),
    },
  };
}

function emptyConfig(): DriftFenceConfig {
  return {
    ignorePaths: new Set(),
    ignoreEnvVars: new Set(),
    ignorePackageScripts: new Set(),
  };
}

function readStringArrayField(
  object: Record<string, unknown>,
  field: "documentGlobs" | "ignoreDocumentGlobs",
  allowEmpty: boolean,
): { value?: string[] } | { message: string } {
  if (!Object.prototype.hasOwnProperty.call(object, field)) {
    return {};
  }

  const value = object[field];

  if (!Array.isArray(value)) {
    return {
      message: `${configPath} field \`${field}\` must be an array of strings.`,
    };
  }

  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      return {
        message: `${configPath} field \`${field}[${index}]\` must be a string.`,
      };
    }
  }

  if (!allowEmpty && value.length === 0) {
    return {
      message: `${configPath} field \`${field}\` must contain at least one pattern.`,
    };
  }

  return { value: value as string[] };
}

function invalidConfig(message: string): ReadConfigResult {
  return {
    config: emptyConfig(),
    issue: {
      type: "config",
      path: configPath,
      message,
    },
  };
}

function findUnsafeDocumentPattern(
  fields: Array<[field: string, patterns: string[]]>,
):
  | { field: string; pattern: string; reason: string }
  | undefined {
  for (const [field, patterns] of fields) {
    for (const pattern of patterns) {
      const reason = getUnsafeDocumentGlobReason(pattern);

      if (reason !== undefined) {
        return { field, pattern, reason };
      }
    }
  }

  return undefined;
}

function stringSet(
  value: unknown,
  normalize = (item: string): string => item,
): Set<string> {
  if (!Array.isArray(value)) {
    return new Set();
  }

  return new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map(normalize),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripBom(content: string): string {
  return content.startsWith("\uFEFF") ? content.slice(1) : content;
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
