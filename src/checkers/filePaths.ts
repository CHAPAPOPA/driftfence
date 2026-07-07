import { access } from "node:fs/promises";
import { resolve } from "node:path";

import type { MarkdownTextReferenceWithPath } from "../markdown/extractMarkdownText.js";

export interface FilePathReference {
  path: string;
  markdownPath: string;
}

export interface FilePathIssue {
  type: "file-path";
  path: string;
  markdownPath: string;
}

const pathTokenPattern =
  /(?:^|[\s"'`(])((?:\.{1,2}[\\/][^\s"'`()<>[\]{}]+|[A-Za-z0-9_.-]+[\\/][^\s"'`()<>[\]{}]+|\.[A-Za-z0-9_-][A-Za-z0-9_.-]*|[A-Za-z0-9_-]+\.[A-Za-z][A-Za-z0-9]{1,7})(?:[?#][A-Za-z0-9_.:/#?=&-]+)?)/g;
const javascriptDottedIdentifierRoots = new Set([
  "Array",
  "Boolean",
  "Buffer",
  "Date",
  "JSON",
  "Map",
  "Math",
  "Number",
  "Object",
  "Promise",
  "Reflect",
  "RegExp",
  "Set",
  "String",
  "Symbol",
  "WeakMap",
  "WeakSet",
  "console",
  "globalThis",
  "import",
  "module",
  "process",
]);

export async function checkFilePaths(
  projectRoot: string,
  references: MarkdownTextReferenceWithPath[],
): Promise<FilePathIssue[]> {
  const pathReferences = findFilePathReferences(references);
  const issues: FilePathIssue[] = [];

  for (const reference of pathReferences) {
    const absolutePath = resolve(projectRoot, reference.path);

    try {
      await access(absolutePath);
    } catch {
      issues.push({
        type: "file-path",
        path: reference.path,
        markdownPath: reference.markdownPath,
      });
    }
  }

  return issues;
}

export function findFilePathReferences(
  references: MarkdownTextReferenceWithPath[],
): FilePathReference[] {
  const pathReferences: FilePathReference[] = [];

  for (const reference of references) {
    pathReferences.push(
      ...findFilePathReferencesInText(reference.value, reference.path),
    );
  }

  return uniquePathReferences(pathReferences);
}

function findFilePathReferencesInText(
  text: string,
  markdownPath: string,
): FilePathReference[] {
  const references: FilePathReference[] = [];

  for (const match of text.matchAll(pathTokenPattern)) {
    if (isPartialDottedToken(text, match)) {
      continue;
    }

    const path = cleanPathCandidate(match[1]);

    if (!isLikelyFilePath(path)) {
      continue;
    }

    references.push({ path, markdownPath });
  }

  return references;
}

function cleanPathCandidate(candidate: string | undefined): string {
  const path = (candidate ?? "")
    .trim()
    .replace(/^[`'"]+|[`'"]+$/g, "")
    .replace(/[),.;:!?]+$/g, "")
    .replace(/\\/g, "/");
  const withoutUrlSuffix = path.split(/[?#]/)[0] ?? "";

  return withoutUrlSuffix
    .replace(/:\d+(?::\d+)?$/g, "")
    .replace(/^\.\//, "");
}

function isLikelyFilePath(path: string): boolean {
  if (
    path.length === 0 ||
    path.startsWith("@") ||
    path.startsWith("-") ||
    path.includes("://") ||
    path.includes("*") ||
    path.includes("$") ||
    isUrlOrDomainLikeReference(path)
  ) {
    return false;
  }

  if (!path.includes("/") && /^[A-Z][a-z]+(?:\.[a-z0-9]+)+$/.test(path)) {
    return false;
  }

  if (isJavaScriptDottedIdentifier(path)) {
    return false;
  }

  return path.includes("/") || path.startsWith(".") || hasExtension(path);
}

function hasExtension(path: string): boolean {
  return /(^|[/\\])[^/\\]+\.[A-Za-z][A-Za-z0-9]{1,7}$/.test(path);
}

function isJavaScriptDottedIdentifier(path: string): boolean {
  if (path.startsWith(".") || path.includes("/") || path.includes("\\")) {
    return false;
  }

  const parts = path.split(".");

  return (
    parts.length > 1 &&
    javascriptDottedIdentifierRoots.has(parts[0] ?? "") &&
    parts.every((part) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part))
  );
}

function isPartialDottedToken(text: string, match: RegExpMatchArray): boolean {
  const candidate = match[1] ?? "";
  const matchText = match[0] ?? "";
  const candidateStart =
    (match.index ?? 0) + Math.max(matchText.lastIndexOf(candidate), 0);
  const candidateEnd = candidateStart + candidate.length;

  return (
    text[candidateEnd] === "." &&
    /^[A-Za-z0-9_-]$/.test(text[candidateEnd + 1] ?? "")
  );
}

function isUrlOrDomainLikeReference(path: string): boolean {
  return (
    isUrlReference(path) ||
    isEmailLikeReference(path) ||
    isLocalhostReference(path) ||
    isIpv4AddressReference(path) ||
    isBareDomainReference(path)
  );
}

function isUrlReference(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

function isEmailLikeReference(path: string): boolean {
  return /^[^\s@/\\]+@[^\s@/\\]+\.[^\s@/\\]+$/.test(path);
}

function isLocalhostReference(path: string): boolean {
  return /^localhost(?::\d+)?(?:\/.*)?$/i.test(path);
}

function isIpv4AddressReference(path: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/.*)?$/.test(path);
}

function isBareDomainReference(path: string): boolean {
  if (path.startsWith(".") || path.includes("\\") || path.includes("@")) {
    return false;
  }

  const host = path.split("/")[0] ?? "";

  return isDomainHost(host);
}

const commonDomainSuffixes = new Set([
  "ai",
  "app",
  "biz",
  "co",
  "com",
  "dev",
  "edu",
  "gov",
  "info",
  "io",
  "me",
  "net",
  "online",
  "org",
  "site",
  "tv",
  "xyz",
]);

function isDomainHost(host: string): boolean {
  const withoutPort = host.replace(/:\d+$/, "");
  const parts = withoutPort.split(".");
  const suffix = parts.at(-1)?.toLowerCase();

  return (
    parts.length > 1 &&
    suffix !== undefined &&
    commonDomainSuffixes.has(suffix) &&
    parts.every((part) =>
      /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(part),
    )
  );
}

function uniquePathReferences(
  references: FilePathReference[],
): FilePathReference[] {
  const seen = new Set<string>();
  const uniqueReferences: FilePathReference[] = [];

  for (const reference of references) {
    const key = `${reference.markdownPath}:${reference.path}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueReferences.push(reference);
  }

  return uniqueReferences;
}
