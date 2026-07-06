import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkFilePaths } from "../src/checkers/filePaths.js";
import { extractMarkdownText } from "../src/markdown/extractMarkdownText.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testDirectory, "fixtures", "basic-project");

describe("file path checker", () => {
  it("reports referenced paths that do not exist", async () => {
    const markdown = await readFile(join(fixtureRoot, "README.md"), "utf8");
    const references = extractMarkdownText(markdown);

    await expect(checkFilePaths(fixtureRoot, references)).resolves.toEqual([
      {
        type: "file-path",
        path: "docs/missing.md",
      },
    ]);
  });
});
