import { lstat, readlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, posix, relative, resolve } from "node:path";

import type {
  MarkdownLinkReferenceWithPath,
  MarkdownTextReferenceWithPath,
} from "../markdown/extractMarkdownText.js";

export interface FilePathReference {
  path: string;
  markdownPath: string;
  relativeToMarkdown?: boolean;
}

export interface FilePathIssue {
  type: "file-path";
  path: string;
  markdownPath: string;
  destination?: string;
  resolvedPath?: string;
}

interface ResolvedPath {
  absolutePath?: string;
  projectPath: string;
}

interface FilePathCheckReference {
  path: string;
  markdownPath: string;
  candidates: ResolvedPath[];
  destination?: string;
  resolvedPath?: string;
}

interface LocalMarkdownPath {
  path: string;
  destination: string;
  isUncPath: boolean;
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
  linkReferences: MarkdownLinkReferenceWithPath[] = [],
): Promise<FilePathIssue[]> {
  const pathReferences = uniqueCheckReferences([
    ...findFilePathReferences(references).map((reference) =>
      resolveTextReference(projectRoot, reference),
    ),
    ...linkReferences.flatMap((reference) =>
      resolveMarkdownLinkReference(projectRoot, reference),
    ),
  ]);
  const issues: FilePathIssue[] = [];

  if (pathReferences.length === 0) {
    return issues;
  }

  const realProjectRoot = await realpath(resolve(projectRoot));

  for (const reference of pathReferences) {
    if (await anyPathExists(reference.candidates, realProjectRoot)) {
      continue;
    }

    issues.push({
      type: "file-path",
      path: reference.path,
      markdownPath: reference.markdownPath,
      ...(reference.destination === undefined
        ? {}
        : { destination: reference.destination }),
      ...(reference.resolvedPath === undefined
        ? {}
        : { resolvedPath: reference.resolvedPath }),
    });
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

    const candidate = normalizePath(match[1] ?? "");
    const path = cleanPathCandidate(candidate);

    if (!isLikelyFilePath(path)) {
      continue;
    }

    references.push({
      path,
      markdownPath,
      ...(isExplicitDocumentRelativePath(candidate)
        ? { relativeToMarkdown: true }
        : {}),
    });
  }

  return references;
}

function resolveTextReference(
  projectRoot: string,
  reference: FilePathReference,
): FilePathCheckReference {
  const rootCandidate = resolveWithinProject(projectRoot, reference.path);
  const markdownCandidate = resolveWithinProject(
    projectRoot,
    posix.join(posix.dirname(reference.markdownPath), reference.path),
  );
  const candidates = reference.relativeToMarkdown
    ? [markdownCandidate, rootCandidate]
    : [rootCandidate, markdownCandidate];

  return {
    path: reference.path,
    markdownPath: reference.markdownPath,
    candidates: uniqueResolvedPaths(candidates),
  };
}

function resolveMarkdownLinkReference(
  projectRoot: string,
  reference: MarkdownLinkReferenceWithPath,
): FilePathCheckReference[] {
  const localPath = getLocalMarkdownPath(reference.destination);

  if (localPath === undefined) {
    return [];
  }

  const { path } = localPath;
  const projectPath =
    localPath.isUncPath || /^[A-Za-z]:\//.test(path)
      ? path
      : path.startsWith("/")
        ? path.replace(/^\/+/, "")
        : posix.join(posix.dirname(reference.path), path);
  const candidate = resolveWithinProject(projectRoot, projectPath);

  return [
    {
      path,
      markdownPath: reference.path,
      candidates: [candidate],
      ...(localPath.destination === path
        ? {}
        : { destination: localPath.destination }),
      resolvedPath: candidate.projectPath,
    },
  ];
}

function getLocalMarkdownPath(
  destination: string,
): LocalMarkdownPath | undefined {
  const originalDestination = destination.trim();
  const isUncPath = originalDestination.startsWith("\\");
  const normalizedDestination = isUncPath
    ? `//${normalizePath(originalDestination).replace(/^\/+/, "")}`
    : normalizePath(originalDestination);

  if (
    normalizedDestination.length === 0 ||
    normalizedDestination.startsWith("#") ||
    originalDestination.startsWith("//") ||
    isNonLocalScheme(normalizedDestination)
  ) {
    return undefined;
  }

  const suffixIndex = normalizedDestination.search(/[?#]/);
  const path =
    suffixIndex === -1
      ? normalizedDestination
      : normalizedDestination.slice(0, suffixIndex);

  if (path.length === 0 || isUrlOrDomainLikeReference(path)) {
    return undefined;
  }

  return { path, destination: normalizedDestination, isUncPath };
}

function isNonLocalScheme(destination: string): boolean {
  return (
    !/^[A-Za-z]:\//.test(destination) &&
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination)
  );
}

function resolveWithinProject(
  projectRoot: string,
  path: string,
): ResolvedPath {
  const normalizedPath = normalizePath(path);

  if (/^[A-Za-z]:\//.test(normalizedPath) || normalizedPath.startsWith("//")) {
    return { projectPath: normalizedPath };
  }

  const absoluteProjectRoot = resolve(projectRoot);
  const absolutePath = resolve(absoluteProjectRoot, normalizedPath);
  const relativePath = relative(absoluteProjectRoot, absolutePath);
  const projectPath = normalizePath(relativePath || ".");

  if (!isPathInsideProject(absoluteProjectRoot, absolutePath)) {
    return { projectPath };
  }

  return { absolutePath, projectPath };
}

async function anyPathExists(
  paths: ResolvedPath[],
  realProjectRoot: string,
): Promise<boolean> {
  for (const path of paths) {
    if (path.absolutePath === undefined) {
      continue;
    }

    if (await pathExistsInsideProject(realProjectRoot, path.projectPath)) {
      return true;
    }
  }

  return false;
}

async function pathExistsInsideProject(
  realProjectRoot: string,
  projectPath: string,
): Promise<boolean> {
  const absolutePath = resolve(realProjectRoot, projectPath);

  if (!isPathInsideProject(realProjectRoot, absolutePath)) {
    return false;
  }

  const remainingSegments = pathSegments(
    relative(realProjectRoot, absolutePath),
  );
  let currentPath = realProjectRoot;
  let followedLinks = 0;

  while (remainingSegments.length > 0) {
    const segment = remainingSegments.shift();

    if (segment === undefined) {
      break;
    }

    const nextPath = resolve(currentPath, segment);

    if (!isPathInsideProject(realProjectRoot, nextPath)) {
      return false;
    }

    let stats;

    try {
      stats = await lstat(nextPath);
    } catch {
      return false;
    }

    if (!stats.isSymbolicLink()) {
      currentPath = nextPath;
      continue;
    }

    followedLinks += 1;

    if (followedLinks > 40) {
      return false;
    }

    let linkTarget: string;

    try {
      linkTarget = normalizeWindowsLinkTarget(await readlink(nextPath));
    } catch {
      return false;
    }

    const absoluteTarget = resolve(dirname(nextPath), linkTarget);

    if (!isPathInsideProject(realProjectRoot, absoluteTarget)) {
      return false;
    }

    remainingSegments.unshift(
      ...pathSegments(relative(realProjectRoot, absoluteTarget)),
    );
    currentPath = realProjectRoot;
  }

  return true;
}

function isPathInsideProject(projectRoot: string, path: string): boolean {
  const relativePath = relative(projectRoot, path);
  const normalizedRelativePath = normalizePath(relativePath);

  return (
    normalizedRelativePath !== ".." &&
    !normalizedRelativePath.startsWith("../") &&
    !isAbsolute(relativePath)
  );
}

function pathSegments(path: string): string[] {
  return normalizePath(path)
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
}

function normalizeWindowsLinkTarget(path: string): string {
  if (path.startsWith("\\\\?\\UNC\\")) {
    return `\\\\${path.slice(8)}`;
  }

  return path.startsWith("\\\\?\\") ? path.slice(4) : path;
}

function uniqueResolvedPaths(paths: ResolvedPath[]): ResolvedPath[] {
  const seen = new Set<string>();

  return paths.filter((path) => {
    const key = path.absolutePath ?? `outside:${path.projectPath}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function uniqueCheckReferences(
  references: FilePathCheckReference[],
): FilePathCheckReference[] {
  const seen = new Set<string>();

  return references.filter((reference) => {
    const key = `${reference.markdownPath}:${reference.path}:${reference.candidates[0]?.projectPath ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isExplicitDocumentRelativePath(path: string): boolean {
  return path.startsWith("./") || path.startsWith("../");
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

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
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
