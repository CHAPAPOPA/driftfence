import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
import { checkProject, type DriftIssue } from "../src/index.js";

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

  it("keeps project-root resolution for inline-code paths", async () => {
    await expect(
      checkProjectFiles({
        "docs/index.md": "See `package.json`.\n",
        "package.json": "{}\n",
      }),
    ).resolves.toEqual([]);
  });

  it("falls back to document-relative resolution for inline-code paths", async () => {
    await expect(
      checkProjectFiles({
        "docs/index.md": "See `guide.md` and `./guide.md`.\n",
        "docs/guide.md": "# Guide\n",
      }),
    ).resolves.toEqual([]);
  });
});

describe("Markdown link checker", () => {
  it("accepts a valid local link from README.md", async () => {
    await expect(
      checkProjectFiles({
        "README.md": "[Guide](docs/guide.md)\n",
        "docs/guide.md": "# Guide\n",
      }),
    ).resolves.toEqual([]);
  });

  it("reports a missing local link from README.md", async () => {
    await expect(
      checkProjectFiles({
        "README.md": '[Guide](docs/missing.md "Guide")\n',
      }),
    ).resolves.toEqual([
      {
        type: "file-path",
        path: "docs/missing.md",
        markdownPath: "README.md",
        resolvedPath: "docs/missing.md",
      },
    ]);
  });

  it("resolves relative links from the containing document", async () => {
    await expect(
      checkProjectFiles({
        "docs/index.md": "[Guide](guide.md)\n",
        "docs/guide.md": "# Guide\n",
      }),
    ).resolves.toEqual([]);
  });

  it("normalizes Windows separators in local links", async () => {
    await expect(
      checkProjectFiles({
        "README.md": "[Guide](docs\\guide.md)\n",
        "docs/guide.md": "# Guide\n",
      }),
    ).resolves.toEqual([]);
  });

  it("resolves parent-directory links", async () => {
    await expect(
      checkProjectFiles({
        "README.md": "# Project\n",
        "docs/index.md": "[Home](../README.md)\n",
      }),
    ).resolves.toEqual([]);
  });

  it("resolves root-relative links from the project root", async () => {
    await expect(
      checkProjectFiles({
        "docs/index.md": "[Guide](/docs/guide.md)\n",
        "docs/guide.md": "# Guide\n",
      }),
    ).resolves.toEqual([]);
  });

  it("checks only the path before query strings and anchors", async () => {
    await expect(
      checkProjectFiles({
        "README.md": "[Guide](docs/guide.md?raw=1#installation)\n",
        "docs/guide.md": "# Installation\n",
      }),
    ).resolves.toEqual([]);
  });

  it("ignores external HTTP and HTTPS links", async () => {
    await expect(
      checkProjectFiles({
        "README.md": [
          "[HTTP](http://example.com/docs)",
          "[HTTPS](https://example.com/docs)",
          "",
        ].join("\n"),
      }),
    ).resolves.toEqual([]);
  });

  it("ignores mailto, tel, data, javascript, and anchor-only links", async () => {
    await expect(
      checkProjectFiles({
        "README.md": [
          "[Email](mailto:user@example.com)",
          "[Phone](tel:+123456789)",
          "![Pixel](data:image/png;base64,AAAA)",
          "[Action](javascript:void(0))",
          "[Install](#installation)",
          "",
        ].join("\n"),
      }),
    ).resolves.toEqual([]);
  });

  it("resolves full, collapsed, and shortcut reference-style links", async () => {
    await expect(
      checkProjectFiles({
        "README.md": [
          "[Guide][guide]",
          "[Guide][]",
          "[Guide]",
          "",
          "[guide]: docs/guide.md",
          "",
        ].join("\n"),
        "docs/guide.md": "# Guide\n",
      }),
    ).resolves.toEqual([]);
  });

  it("reports a missing reference-style link", async () => {
    await expect(
      checkProjectFiles({
        "README.md": "[Guide][guide]\n\n[guide]: docs/missing.md\n",
      }),
    ).resolves.toEqual([
      {
        type: "file-path",
        path: "docs/missing.md",
        markdownPath: "README.md",
        resolvedPath: "docs/missing.md",
      },
    ]);
  });

  it("accepts direct and reference-style local images", async () => {
    await expect(
      checkProjectFiles({
        "README.md": [
          "![Logo](assets/logo.png)",
          "![Logo][logo]",
          "",
          "[logo]: assets/logo.png",
          "",
        ].join("\n"),
        "assets/logo.png": "image",
      }),
    ).resolves.toEqual([]);
  });

  it("reports paths that escape the project root without checking them", async () => {
    await expect(
      checkProjectFiles({
        "docs/index.md": "[Outside](../../outside.md)\n",
      }),
    ).resolves.toEqual([
      {
        type: "file-path",
        path: "../../outside.md",
        markdownPath: "docs/index.md",
        resolvedPath: "../outside.md",
      },
    ]);
  });

  it("reports Windows absolute paths without checking them", async () => {
    await expect(
      checkProjectFiles({
        "README.md": "[Outside](C:\\outside.md)\n",
      }),
    ).resolves.toEqual([
      {
        type: "file-path",
        path: "C:/outside.md",
        markdownPath: "README.md",
        resolvedPath: "C:/outside.md",
      },
    ]);
  });

  it("ignores Markdown links inside driftfence ignore blocks", async () => {
    await expect(
      checkProjectFiles({
        "README.md": [
          "<!-- driftfence-ignore-start -->",
          "[Missing](docs/missing.md)",
          "<!-- driftfence-ignore-end -->",
          "",
        ].join("\n"),
      }),
    ).resolves.toEqual([]);
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

async function checkProjectFiles(
  files: Record<string, string>,
): Promise<DriftIssue[]> {
  const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-"));

  try {
    for (const [path, content] of Object.entries(files)) {
      const absolutePath = join(projectRoot, path);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content);
    }

    return (await checkProject(projectRoot)).issues;
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}
