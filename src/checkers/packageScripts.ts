import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { MarkdownTextReferenceWithPath } from "../markdown/extractMarkdownText.js";

export interface PackageScriptReference {
  path: string;
  command: string;
  packageManager: "npm" | "pnpm" | "yarn";
  script: string;
}

export interface PackageScriptIssue {
  type: "package-script";
  path: string;
  command: string;
  script: string;
}

export interface PackageJsonIssue {
  type: "package-json";
  path: string;
  message: string;
}

type PackageJson = {
  scripts?: Record<string, unknown>;
};

const npmScriptPattern =
  /\bnpm\s+(?:run\s+([A-Za-z0-9:_-]+)|(start|test))\b/g;
const shorthandScriptPattern =
  /\b(pnpm|yarn)\s+(?:run\s+)?([A-Za-z0-9:_-]+)\b/g;

const packageManagerCommands = new Set([
  "add",
  "audit",
  "bin",
  "cache",
  "ci",
  "config",
  "create",
  "dedupe",
  "dlx",
  "doctor",
  "exec",
  "explain",
  "global",
  "help",
  "import",
  "init",
  "install",
  "link",
  "list",
  "login",
  "logout",
  "node",
  "outdated",
  "pack",
  "patch",
  "plugin",
  "publish",
  "rebuild",
  "remove",
  "root",
  "run",
  "search",
  "set",
  "setup",
  "store",
  "uninstall",
  "unlink",
  "update",
  "upgrade",
  "view",
  "why",
  "workspace",
  "workspaces",
]);

export type PackageScriptCheckIssue = PackageScriptIssue | PackageJsonIssue;

export async function checkPackageScripts(
  projectRoot: string,
  references: MarkdownTextReferenceWithPath[],
): Promise<PackageScriptCheckIssue[]> {
  const scriptReferences = findPackageScriptReferences(references);

  if (scriptReferences.length === 0) {
    return [];
  }

  const packageJsonResult = await readPackageJson(projectRoot);

  if ("issue" in packageJsonResult) {
    return [packageJsonResult.issue];
  }

  const scripts = packageJsonResult.packageJson.scripts ?? {};

  return scriptReferences
    .filter((reference) => !hasOwn(scripts, reference.script))
    .map((reference) => ({
      type: "package-script",
      path: reference.path,
      command: reference.command,
      script: reference.script,
    }));
}

export function findPackageScriptReferences(
  references: MarkdownTextReferenceWithPath[],
): PackageScriptReference[] {
  const scriptReferences: PackageScriptReference[] = [];

  for (const reference of references) {
    scriptReferences.push(...findNpmScriptReferences(reference.value, reference.path));
    scriptReferences.push(
      ...findShorthandScriptReferences(reference.value, reference.path),
    );
  }

  return uniqueScriptReferences(scriptReferences);
}

function findNpmScriptReferences(
  text: string,
  path: string,
): PackageScriptReference[] {
  const references: PackageScriptReference[] = [];

  for (const match of text.matchAll(npmScriptPattern)) {
    const npmRunScript = match[1];
    const npmTestScript = match[2];
    const script = npmRunScript ?? npmTestScript;

    if (!script) {
      continue;
    }

    references.push({
      path,
      command: normalizeCommand(match[0]),
      packageManager: "npm",
      script,
    });
  }

  return references;
}

function findShorthandScriptReferences(
  text: string,
  path: string,
): PackageScriptReference[] {
  const references: PackageScriptReference[] = [];

  for (const match of text.matchAll(shorthandScriptPattern)) {
    const packageManager = match[1];
    const script = match[2];

    if (
      (packageManager !== "pnpm" && packageManager !== "yarn") ||
      !script ||
      packageManagerCommands.has(script)
    ) {
      continue;
    }

    references.push({
      path,
      command: normalizeCommand(match[0]),
      packageManager,
      script,
    });
  }

  return references;
}

async function readPackageJson(
  projectRoot: string,
): Promise<{ packageJson: PackageJson } | { issue: PackageJsonIssue }> {
  const path = "package.json";
  const packageJsonPath = join(projectRoot, path);
  let rawPackageJson: string;

  try {
    rawPackageJson = await readFile(packageJsonPath, "utf8");
  } catch (error) {
    return {
      issue: {
        type: "package-json",
        path,
        message:
          getErrorCode(error) === "ENOENT"
            ? "package.json was not found."
            : `package.json could not be read: ${getErrorMessage(error)}`,
      },
    };
  }

  try {
    return { packageJson: JSON.parse(rawPackageJson) as PackageJson };
  } catch (error) {
    return {
      issue: {
        type: "package-json",
        path,
        message: `package.json is not valid JSON: ${getErrorMessage(error)}`,
      },
    };
  }
}

function uniqueScriptReferences(
  references: PackageScriptReference[],
): PackageScriptReference[] {
  const seen = new Set<string>();
  const uniqueReferences: PackageScriptReference[] = [];

  for (const reference of references) {
    const key = `${reference.path}:${reference.packageManager}:${reference.command}:${reference.script}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueReferences.push(reference);
  }

  return uniqueReferences;
}

function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, " ").trim();
}

function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
