import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  extractMarkdownText,
  type MarkdownTextReferenceWithPath,
} from "./extractMarkdownText.js";

export interface MarkdownDocument {
  path: string;
  content: string;
  references: MarkdownTextReferenceWithPath[];
}

export async function readMarkdownDocuments(
  projectRoot: string,
): Promise<MarkdownDocument[]> {
  const paths = await findMarkdownPaths(projectRoot);
  const documents: MarkdownDocument[] = [];

  for (const path of paths) {
    const content = await readFile(join(projectRoot, path), "utf8");

    documents.push({
      path,
      content,
      references: extractMarkdownText(content).map((reference) => ({
        ...reference,
        path,
      })),
    });
  }

  return documents;
}

async function findMarkdownPaths(projectRoot: string): Promise<string[]> {
  const paths: string[] = [];

  if (await fileExists(join(projectRoot, "README.md"))) {
    paths.push("README.md");
  }

  paths.push(...(await findDocsMarkdownPaths(projectRoot)));

  return paths;
}

async function findDocsMarkdownPaths(projectRoot: string): Promise<string[]> {
  const docsRoot = join(projectRoot, "docs");
  const paths = await findMarkdownPathsInDirectory(docsRoot);

  return paths
    .map((path) => normalizePath(relative(projectRoot, path)))
    .sort((first, second) => first.localeCompare(second));
}

async function findMarkdownPathsInDirectory(directory: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return [];
    }

    throw error;
  }

  const paths: string[] = [];

  for (const entry of entries.sort((first, second) =>
    first.name.localeCompare(second.name),
  )) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      paths.push(...(await findMarkdownPathsInDirectory(path)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      paths.push(path);
    }
  }

  return paths;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}
