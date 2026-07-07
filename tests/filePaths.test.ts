import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  checkFilePaths,
  findFilePathReferences,
} from "../src/checkers/filePaths.js";
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

  it("does not detect JavaScript dotted identifiers as file paths", () => {
    const references = markdownReferences([
      "`process.env`",
      "`import.meta`",
      "`console.log`",
      "`module.exports`",
      "`Object.keys`",
      "`Array.from`",
      "`Promise.resolve`",
    ].join("\n"));

    expect(findFilePathReferences(references)).toEqual([]);
  });

  it("does not detect URLs, domains, or email-like references as file paths", () => {
    const references = markdownReferences([
      "`example.com`",
      "`api.example.com`",
      "`user@example.com`",
      "`https://example.com/docs`",
      "`localhost:3000`",
      "`127.0.0.1:3000`",
    ].join("\n"));

    expect(findFilePathReferences(references)).toEqual([]);
  });

  it("still detects real file paths", () => {
    const references = markdownReferences(
      [
        "`src/index.ts`",
        "`docs/config.md`",
        "`.env.example`",
        "`package.json`",
      ].join("\n"),
    );

    expect(findFilePathReferences(references)).toEqual([
      {
        path: "src/index.ts",
        markdownPath: "README.md",
      },
      {
        path: "docs/config.md",
        markdownPath: "README.md",
      },
      {
        path: ".env.example",
        markdownPath: "README.md",
      },
      {
        path: "package.json",
        markdownPath: "README.md",
      },
    ]);
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
