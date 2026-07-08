import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface DriftFenceConfig {
  ignorePaths: Set<string>;
  ignoreEnvVars: Set<string>;
  ignorePackageScripts: Set<string>;
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
    return { config: parseConfig(JSON.parse(stripBom(rawConfig))) };
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

function parseConfig(config: unknown): DriftFenceConfig {
  const object = isRecord(config) ? config : {};

  return {
    ignorePaths: stringSet(object.ignorePaths, normalizePath),
    ignoreEnvVars: stringSet(object.ignoreEnvVars),
    ignorePackageScripts: stringSet(object.ignorePackageScripts),
  };
}

function emptyConfig(): DriftFenceConfig {
  return {
    ignorePaths: new Set(),
    ignoreEnvVars: new Set(),
    ignorePackageScripts: new Set(),
  };
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

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
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
