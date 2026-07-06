#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

import cac from "cac";

import { checkProject } from "./index.js";
import { formatReport } from "./report/formatReport.js";

const cli = cac("driftfence");

cli
  .command("check [projectDir]", "Check README.md for documentation drift")
  .action(async (projectDir?: string) => {
    try {
      const projectRoot = await resolveProjectRoot(projectDir);
      const result = await checkProject(projectRoot);

      console.log(formatReport(result));
      process.exitCode = result.issues.length > 0 ? 1 : 0;
    } catch (error) {
      if (error instanceof ProjectDirectoryError) {
        console.error(`DriftFence: ${error.message}`);
        process.exitCode = 2;
        return;
      }

      console.error(`DriftFence failed: ${getErrorMessage(error)}`);
      process.exitCode = 1;
    }
  });

cli.help();
cli.parse();

if (
  !cli.matchedCommand &&
  !process.argv.some((argument) => argument === "--help" || argument === "-h")
) {
  cli.outputHelp();
  process.exitCode = 1;
}

async function resolveProjectRoot(projectDir?: string): Promise<string> {
  const projectRoot = resolve(projectDir ?? process.cwd());

  try {
    const stats = await stat(projectRoot);

    if (!stats.isDirectory()) {
      throw new ProjectDirectoryError(
        `Project path is not a directory: ${projectRoot}`,
      );
    }

    return projectRoot;
  } catch (error) {
    if (error instanceof ProjectDirectoryError) {
      throw error;
    }

    if (getErrorCode(error) === "ENOENT") {
      throw new ProjectDirectoryError(
        `Project directory does not exist: ${projectRoot}`,
      );
    }

    throw error;
  }
}

class ProjectDirectoryError extends Error {}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
