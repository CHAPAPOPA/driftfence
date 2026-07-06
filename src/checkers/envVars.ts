import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import type { MarkdownDocument } from "../markdown/readMarkdownDocuments.js";

export interface EnvVarIssue {
  type: "env-var";
  name: string;
  source: "markdown" | "source";
  path: string;
}

export interface EnvVarReference {
  name: string;
  source: "markdown" | "source";
  path: string;
}

const envVarPattern = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const processEnvPattern =
  /\bprocess\.env\.([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;
const importMetaEnvPattern =
  /\bimport\.meta\.env\.([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export async function checkEnvVars(
  projectRoot: string,
  markdownDocuments: MarkdownDocument[],
): Promise<EnvVarIssue[]> {
  const envExampleNames = await readEnvExampleNames(projectRoot);
  const references = [
    ...markdownDocuments.flatMap((document) =>
      findMarkdownEnvVarReferences(document),
    ),
    ...(await findSourceEnvVarReferences(projectRoot)),
  ];

  return references
    .filter((reference) => !envExampleNames.has(reference.name))
    .map((reference) => ({
      type: "env-var",
      name: reference.name,
      source: reference.source,
      path: reference.path,
    }));
}

export function findEnvExampleNames(content: string): Set<string> {
  const names = new Set<string>();

  for (const line of content.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
      continue;
    }

    const match = /^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\s*=/.exec(trimmedLine);

    if (match?.[1]) {
      names.add(match[1]);
    }
  }

  return names;
}

export function findReadmeEnvVarReferences(
  readmeMarkdown: string,
): EnvVarReference[] {
  return findMarkdownEnvVarReferences({
    path: "README.md",
    content: readmeMarkdown,
  });
}

export function findMarkdownEnvVarReferences(
  document: Pick<MarkdownDocument, "path" | "content">,
): EnvVarReference[] {
  return uniqueEnvVarReferences(
    [...document.content.matchAll(envVarPattern)].map((match) => ({
      name: match[0],
      source: "markdown",
      path: document.path,
    })),
  );
}

async function readEnvExampleNames(projectRoot: string): Promise<Set<string>> {
  try {
    return findEnvExampleNames(
      await readFile(join(projectRoot, ".env.example"), "utf8"),
    );
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return new Set();
    }

    throw error;
  }
}

async function findSourceEnvVarReferences(
  projectRoot: string,
): Promise<EnvVarReference[]> {
  const sourceRoot = join(projectRoot, "src");
  const sourceFiles = await findSourceFiles(sourceRoot);
  const references: EnvVarReference[] = [];

  for (const sourceFile of sourceFiles) {
    const content = await readFile(sourceFile, "utf8");
    const path = normalizePath(relative(projectRoot, sourceFile));

    references.push(
      ...findSourceEnvVarReferencesInText(content).map((reference) => ({
        ...reference,
        path,
      })),
    );
  }

  return uniqueEnvVarReferences(references);
}

function findSourceEnvVarReferencesInText(content: string): EnvVarReference[] {
  const references: EnvVarReference[] = [];

  for (const match of content.matchAll(processEnvPattern)) {
    if (match[1]) {
      references.push({ name: match[1], source: "source", path: "" });
    }
  }

  for (const match of content.matchAll(importMetaEnvPattern)) {
    if (match[1]) {
      references.push({ name: match[1], source: "source", path: "" });
    }
  }

  return references;
}

async function findSourceFiles(directory: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return [];
    }

    throw error;
  }

  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findSourceFiles(path)));
      continue;
    }

    if (entry.isFile() && sourceExtensions.has(getExtension(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

function uniqueEnvVarReferences(
  references: EnvVarReference[],
): EnvVarReference[] {
  const seen = new Set<string>();
  const uniqueReferences: EnvVarReference[] = [];

  for (const reference of references) {
    const key = `${reference.source}:${reference.path}:${reference.name}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueReferences.push(reference);
  }

  return uniqueReferences;
}

function getExtension(path: string): string {
  const index = path.lastIndexOf(".");

  return index === -1 ? "" : path.slice(index);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}
