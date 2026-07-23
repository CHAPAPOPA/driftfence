import fastGlob from "fast-glob";

import {
  getRealProjectRoot,
  normalizePath,
  pathExistsInsideProject,
} from "../paths/projectPaths.js";

export interface MarkdownDocumentDiscoveryOptions {
  documentGlobs?: string[];
  ignoreDocumentGlobs?: string[];
}

export const defaultDocumentGlobs = [
  "README.md",
  "docs/**/*.md",
  "docs/**/*.mdx",
];

const alwaysIgnoredDocumentGlobs = ["**/node_modules/**", "**/.git/**"];

export async function findMarkdownDocumentPaths(
  projectRoot: string,
  options: MarkdownDocumentDiscoveryOptions = {},
): Promise<string[]> {
  const sourceDocumentGlobs = options.documentGlobs ?? defaultDocumentGlobs;
  const sourceIgnoreDocumentGlobs = options.ignoreDocumentGlobs ?? [];

  validateDocumentGlobs(sourceDocumentGlobs);
  validateDocumentGlobs(sourceIgnoreDocumentGlobs);

  if (sourceDocumentGlobs.length === 0) {
    return [];
  }

  const documentGlobs = sourceDocumentGlobs.map(normalizePath);
  const ignoreDocumentGlobs = sourceIgnoreDocumentGlobs.map(normalizePath);
  const realProjectRoot = await getRealProjectRoot(projectRoot);
  const matchedPaths = await fastGlob(documentGlobs, {
    cwd: realProjectRoot,
    dot: true,
    followSymbolicLinks: false,
    ignore: [...alwaysIgnoredDocumentGlobs, ...ignoreDocumentGlobs],
    onlyFiles: true,
    unique: true,
  });
  const safePaths = new Set<string>();

  for (const matchedPath of matchedPaths) {
    const path = normalizePath(matchedPath);

    if (
      isMarkdownDocument(path) &&
      (await pathExistsInsideProject(realProjectRoot, path))
    ) {
      safePaths.add(path);
    }
  }

  return [...safePaths].sort(comparePaths);
}

export function getUnsafeDocumentGlobReason(
  pattern: string,
): string | undefined {
  if (pattern.length === 0) {
    return "empty patterns are not allowed";
  }

  if (pattern.includes("\0")) {
    return "null bytes are not allowed";
  }

  const normalizedPattern = normalizePath(pattern);

  if (
    pattern.startsWith("\\\\") ||
    normalizedPattern.startsWith("//")
  ) {
    return "UNC paths are not allowed";
  }

  if (
    /^[A-Za-z]:\//.test(normalizedPattern) ||
    hasAbsoluteAlternative(normalizedPattern)
  ) {
    return "absolute paths are not allowed";
  }

  if (hasParentTraversal(normalizedPattern)) {
    return "parent traversal is not allowed";
  }

  return undefined;
}

function validateDocumentGlobs(patterns: string[]): void {
  for (const pattern of patterns) {
    const reason = getUnsafeDocumentGlobReason(pattern);

    if (reason !== undefined) {
      throw new Error(`Unsafe document glob \`${pattern}\`: ${reason}.`);
    }
  }
}

function hasAbsoluteAlternative(pattern: string): boolean {
  return /(^|[!,{(|])\/|(^|[!,{(|])[A-Za-z]:\//.test(pattern);
}

function hasParentTraversal(pattern: string): boolean {
  return /(^|[/!,{(|])\.\.(?=\/|$|[},)|])/.test(pattern);
}

function isMarkdownDocument(path: string): boolean {
  return path.endsWith(".md") || path.endsWith(".mdx");
}

function comparePaths(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}
