import {
  checkPackageScripts,
  type PackageScriptCheckIssue,
} from "./checkers/packageScripts.js";
import { checkFilePaths, type FilePathIssue } from "./checkers/filePaths.js";
import { checkEnvVars, type EnvVarIssue } from "./checkers/envVars.js";
import { type MarkdownTextReferenceWithPath } from "./markdown/extractMarkdownText.js";
import {
  readMarkdownDocuments,
  type MarkdownDocument,
} from "./markdown/readMarkdownDocuments.js";
import {
  readConfig,
  type ConfigIssue,
  type DriftFenceConfig,
} from "./config/readConfig.js";

export type DriftIssue =
  | PackageScriptCheckIssue
  | FilePathIssue
  | EnvVarIssue
  | ConfigIssue;

export interface CheckResult {
  projectRoot: string;
  markdownDocuments: MarkdownDocument[];
  markdownReferences: MarkdownTextReferenceWithPath[];
  issues: DriftIssue[];
}

export async function checkProject(
  projectRoot = process.cwd(),
): Promise<CheckResult> {
  const configResult = await readConfig(projectRoot);
  const markdownDocuments = await readMarkdownDocuments(projectRoot);
  const markdownReferences = markdownDocuments.flatMap(
    (document) => document.references,
  );
  const configIssues = configResult.issue ? [configResult.issue] : [];

  if (markdownDocuments.length === 0) {
    return {
      projectRoot,
      markdownDocuments,
      markdownReferences,
      issues: configIssues,
    };
  }

  const [packageScriptIssues, filePathIssues, envVarIssues] = await Promise.all([
    checkPackageScripts(projectRoot, markdownReferences),
    checkFilePaths(projectRoot, markdownReferences),
    checkEnvVars(projectRoot, markdownDocuments),
  ]);

  return {
    projectRoot,
    markdownDocuments,
    markdownReferences,
    issues: [
      ...configIssues,
      ...filterIgnoredIssues(
        [...packageScriptIssues, ...filePathIssues, ...envVarIssues],
        configResult.config,
      ),
    ],
  };
}

function filterIgnoredIssues(
  issues: DriftIssue[],
  config: DriftFenceConfig,
): DriftIssue[] {
  return issues.filter((issue) => {
    if (issue.type === "file-path") {
      return !config.ignorePaths.has(normalizePath(issue.path));
    }

    if (issue.type === "env-var") {
      return !config.ignoreEnvVars.has(issue.name);
    }

    if (issue.type === "package-script") {
      return !config.ignorePackageScripts.has(issue.script);
    }

    return true;
  });
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export { checkEnvVars, findEnvExampleNames } from "./checkers/envVars.js";
export { readConfig } from "./config/readConfig.js";
export { checkFilePaths, findFilePathReferences } from "./checkers/filePaths.js";
export {
  checkPackageScripts,
  findPackageScriptReferences,
} from "./checkers/packageScripts.js";
export { extractMarkdownText } from "./markdown/extractMarkdownText.js";
export { readMarkdownDocuments } from "./markdown/readMarkdownDocuments.js";
export { formatReport } from "./report/formatReport.js";
