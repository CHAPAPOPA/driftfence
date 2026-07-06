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

export type DriftIssue =
  | PackageScriptCheckIssue
  | FilePathIssue
  | EnvVarIssue;

export interface CheckResult {
  projectRoot: string;
  markdownDocuments: MarkdownDocument[];
  markdownReferences: MarkdownTextReferenceWithPath[];
  issues: DriftIssue[];
}

export async function checkProject(
  projectRoot = process.cwd(),
): Promise<CheckResult> {
  const markdownDocuments = await readMarkdownDocuments(projectRoot);
  const markdownReferences = markdownDocuments.flatMap(
    (document) => document.references,
  );

  if (markdownDocuments.length === 0) {
    return {
      projectRoot,
      markdownDocuments,
      markdownReferences,
      issues: [],
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
export { readMarkdownDocuments } from "./markdown/readMarkdownDocuments.js";
export { formatReport } from "./report/formatReport.js";
