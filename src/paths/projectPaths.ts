import { lstat, readlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export async function getRealProjectRoot(projectRoot: string): Promise<string> {
  return realpath(resolve(projectRoot));
}

export async function pathExistsInsideProject(
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

export function isPathInsideProject(
  projectRoot: string,
  path: string,
): boolean {
  const relativePath = relative(projectRoot, path);
  const normalizedRelativePath = normalizePath(relativePath);

  return (
    normalizedRelativePath !== ".." &&
    !normalizedRelativePath.startsWith("../") &&
    !isAbsolute(relativePath)
  );
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
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
