import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkProject } from "../src/index.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixturesDirectory = join(testDirectory, "fixtures");

describe("project fixtures", () => {
  it("reports no issues for the clean fixture", async () => {
    const result = await checkProject(
      join(fixturesDirectory, "basic-clean-project"),
    );

    expect(result.issues).toEqual([]);
  });

  it("reports expected issues for the drift fixture", async () => {
    const result = await checkProject(
      join(fixturesDirectory, "basic-drift-project"),
    );

    expect(result.issues).toEqual([
      {
        type: "package-script",
        command: "npm run build",
        script: "build",
      },
      {
        type: "file-path",
        path: "docs/missing.md",
      },
      {
        type: "env-var",
        name: "DATABASE_URL",
        source: "source",
        path: "src/index.ts",
      },
    ]);
  });
});
