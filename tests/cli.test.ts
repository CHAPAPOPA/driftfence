import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runCli as runCliEntry } from "../src/cli.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(testDirectory);

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

describe("CLI exit codes", () => {
  it("exits 0 for a clean project", async () => {
    const result = await runCliForTest([
      "check",
      fixturePath("basic-clean-project"),
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("no documentation drift found");
  });

  it("exits 1 for a project with documentation drift", async () => {
    const result = await runCliForTest([
      "check",
      fixturePath("basic-drift-project"),
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("4 issues found");
  });

  it("exits 2 for an invalid project directory", async () => {
    const result = await runCliForTest(["check", fixturePath("does-not-exist")]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Project directory does not exist");
  });
});

function fixturePath(name: string): string {
  return join(projectRoot, "tests", "fixtures", name);
}

async function runCliForTest(args: string[]): Promise<CliResult> {
  let stdout = "";
  let stderr = "";

  const code = await runCliEntry(args, {
    stdout(message) {
      stdout += `${message}\n`;
    },
    stderr(message) {
      stderr += `${message}\n`;
    },
  });

  return { code, stdout, stderr };
}
