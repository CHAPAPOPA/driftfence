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
    path.includes("$")
  ) {
    return false;
  }

  if (!path.includes("/") && /^[A-Z][a-z]+(?:\.[a-z0-9]+)+$/.test(path)) {
    return false;
  }

  return path.includes("/") || path.startsWith(".") || hasExtension(path);
}

function hasExtension(path: string): boolean {
  return /(^|[/\\])[^/\\]+\.[A-Za-z][A-Za-z0-9]{1,7}$/.test(path);
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
