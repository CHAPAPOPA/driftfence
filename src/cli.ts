#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import cac from "cac";

import { checkProject } from "./index.js";
import { formatReport } from "./report/formatReport.js";

export interface CliOutput {
  stdout(message: string): void;
  stderr(message: string): void;
}

const defaultOutput: CliOutput = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

export async function runCli(
  args = process.argv.slice(2),
  output = defaultOutput,
): Promise<number> {
  const cli = cac("driftfence");
  let exitCode = 0;

  cli
    .command("check [projectDir]", "Check README.md for documentation drift")
    .action(async (projectDir?: string) => {
      try {
        const projectRoot = await resolveProjectRoot(projectDir);
        const result = await checkProject(projectRoot);

        output.stdout(formatReport(result));
        exitCode = result.issues.length > 0 ? 1 : 0;
      } catch (error) {
        if (error instanceof ProjectDirectoryError) {
          output.stderr(`DriftFence: ${error.message}`);
          exitCode = 2;
          return;
        }

        output.stderr(`DriftFence failed: ${getErrorMessage(error)}`);
        exitCode = 1;
      }
    });

  cli.help();
  cli.parse([process.execPath, fileURLToPath(import.meta.url), ...args], {
    run: false,
  });

  if (!cli.matchedCommand && !args.some(isHelpArgument)) {
    cli.outputHelp();
    return 1;
  }

  await cli.runMatchedCommand();
  return exitCode;
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

function isDirectEntrypoint(): boolean {
  return process.argv[1]
    ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;
}

function isHelpArgument(argument: string): boolean {
  return argument === "--help" || argument === "-h";
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (isDirectEntrypoint()) {
  process.exitCode = await runCli();
}
