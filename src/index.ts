import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  checkPackageScripts,
  type PackageScriptCheckIssue,
} from "./checkers/packageScripts.js";
import { checkFilePaths, type FilePathIssue } from "./checkers/filePaths.js";
import { checkEnvVars, type EnvVarIssue } from "./checkers/envVars.js";
import {
  extractMarkdownText,
  type MarkdownTextReference,
} from "./markdown/extractMarkdownText.js";

export interface ReadmeIssue {
  type: "readme";
  path: string;
  message: string;
}

export type DriftIssue =
  | ReadmeIssue
  | PackageScriptCheckIssue
  | FilePathIssue
  | EnvVarIssue;

export interface CheckResult {
  projectRoot: string;
  readmePath: string;
  markdownReferences: MarkdownTextReference[];
  issues: DriftIssue[];
}

export async function checkProject(
  projectRoot = process.cwd(),
): Promise<CheckResult> {
  const readmePath = "README.md";
  const markdown = await readReadme(projectRoot, readmePath);

  if ("issue" in markdown) {
    return {
      projectRoot,
      readmePath,
      markdownReferences: [],
      issues: [markdown.issue],
    };
  }

  const markdownReferences = extractMarkdownText(markdown.content);
  const [packageScriptIssues, filePathIssues, envVarIssues] = await Promise.all([
    checkPackageScripts(projectRoot, markdownReferences),
    checkFilePaths(projectRoot, markdownReferences),
    checkEnvVars(projectRoot, markdown.content),
  ]);

  return {
    projectRoot,
    readmePath,
    markdownReferences,
    issues: [...packageScriptIssues, ...filePathIssues, ...envVarIssues],
  };
}

export { checkEnvVars, findEnvExampleNames } from "./checkers/envVars.js";
export { checkFilePaths, findFilePathReferences } from "./checkers/filePaths.js";
export {
  checkPackageScripts,
  findPackageScriptReferences,
} from "./checkers/packageScripts.js";
export { extractMarkdownText } from "./markdown/extractMarkdownText.js";
export { formatReport } from "./report/formatReport.js";

async function readReadme(
  projectRoot: string,
  path: string,
): Promise<{ content: string } | { issue: ReadmeIssue }> {
  try {
    return { content: await readFile(join(projectRoot, path), "utf8") };
  } catch (error) {
    return {
      issue: {
        type: "readme",
        path,
        message:
          getErrorCode(error) === "ENOENT"
            ? "README.md was not found."
            : `README.md could not be read: ${getErrorMessage(error)}`,
      },
    };
  }
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
