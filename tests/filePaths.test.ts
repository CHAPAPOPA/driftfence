import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkFilePaths } from "../src/checkers/filePaths.js";
import {
  extractMarkdownText,
  type MarkdownTextReferenceWithPath,
} from "../src/markdown/extractMarkdownText.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testDirectory, "fixtures", "basic-drift-project");

describe("file path checker", () => {
  it("reports referenced paths that do not exist", async () => {
    const markdown = await readFile(join(fixtureRoot, "README.md"), "utf8");
    const references = markdownReferences(markdown);

    await expect(checkFilePaths(fixtureRoot, references)).resolves.toEqual([
      {
        type: "file-path",
        path: "docs/missing.md",
        markdownPath: "README.md",
      },
    ]);
  });

  it("ignores file path references inside driftfence ignore blocks", async () => {
    const references = markdownReferences(`
<!-- driftfence-ignore-start -->
See \`docs/missing.md\`.
<!-- driftfence-ignore-end -->
`);

    await expect(checkFilePaths(fixtureRoot, references)).resolves.toEqual([]);
  });
});

function markdownReferences(
  markdown: string,
  path = "README.md",
): MarkdownTextReferenceWithPath[] {
  return extractMarkdownText(markdown).map((reference) => ({
    ...reference,
    path,
  }));
}
