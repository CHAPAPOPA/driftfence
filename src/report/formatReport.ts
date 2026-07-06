import type { CheckResult, DriftIssue } from "../index.js";

export function formatReport(result: CheckResult): string {
  if (result.issues.length === 0) {
    return [
      "DriftFence: no documentation drift found.",
      `Checked ${result.readmePath}.`,
    ].join("\n");
  }

  const projectIssues = result.issues.filter(isProjectIssue);
  const packageScriptIssues = result.issues.filter(isPackageScriptIssue);
  const filePathIssues = result.issues.filter(isFilePathIssue);
  const lines = ["DriftFence found documentation drift.", ""];

  appendSection(
    lines,
    "Project",
    projectIssues.map((issue) => `- ${issue.message}`),
  );
  appendSection(
    lines,
    "Package scripts",
    packageScriptIssues.map(
      (issue) =>
        `- \`${issue.command}\` references missing package.json script \`${issue.script}\`.`,
    ),
  );
  appendSection(
    lines,
    "File paths",
    filePathIssues.map((issue) => `- \`${issue.path}\` does not exist.`),
  );

  lines.push("");
  lines.push(`${result.issues.length} ${pluralize("issue", result.issues.length)} found.`);

  return lines.join("\n");
}

function appendSection(lines: string[], title: string, entries: string[]): void {
  if (entries.length === 0) {
    return;
  }

  lines.push(`${title}:`);
  lines.push(...entries);
  lines.push("");
}

function isProjectIssue(
  issue: DriftIssue,
): issue is Extract<DriftIssue, { type: "package-json" | "readme" }> {
  return issue.type === "package-json" || issue.type === "readme";
}

function isPackageScriptIssue(
  issue: DriftIssue,
): issue is Extract<DriftIssue, { type: "package-script" }> {
  return issue.type === "package-script";
}

function isFilePathIssue(
  issue: DriftIssue,
): issue is Extract<DriftIssue, { type: "file-path" }> {
  return issue.type === "file-path";
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}
