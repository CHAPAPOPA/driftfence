import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkProject, readMarkdownDocuments } from "../src/index.js";
import { formatReport } from "../src/report/formatReport.js";

describe("configurable Markdown document discovery", () => {
  it("discovers a custom root-level CONTRIBUTING.md", async () => {
    await withProject(
      {
        "CONTRIBUTING.md": "# Contributing\n",
      },
      async (projectRoot) => {
        await expect(
          documentPaths(projectRoot, {
            documentGlobs: ["CONTRIBUTING.md"],
          }),
        ).resolves.toEqual(["CONTRIBUTING.md"]);
      },
    );
  });

  it("discovers Markdown files in a custom guides directory", async () => {
    await withProject(
      {
        "guides/getting-started.md": "# Start\n",
        "guides/nested/config.md": "# Config\n",
      },
      async (projectRoot) => {
        await expect(
          documentPaths(projectRoot, {
            documentGlobs: ["guides/**/*.md"],
          }),
        ).resolves.toEqual([
          "guides/getting-started.md",
          "guides/nested/config.md",
        ]);
      },
    );
  });

  it("supports brace patterns for Markdown and MDX in a custom directory", async () => {
    await withProject(
      {
        "documentation/guide.md": "# Guide\n",
        "documentation/setup/install.mdx": "# Install\n",
        "documentation/setup/notes.txt": "Not Markdown\n",
      },
      async (projectRoot) => {
        await expect(
          documentPaths(projectRoot, {
            documentGlobs: ["documentation/**/*.{md,mdx}"],
          }),
        ).resolves.toEqual([
          "documentation/guide.md",
          "documentation/setup/install.mdx",
        ]);
      },
    );
  });

  it("supports package README glob patterns", async () => {
    await withProject(
      {
        "packages/core/README.md": "# Core\n",
        "packages/web/README.md": "# Web\n",
        "packages/web/guide.md": "# Guide\n",
      },
      async (projectRoot) => {
        await expect(
          documentPaths(projectRoot, {
            documentGlobs: ["packages/*/README.md"],
          }),
        ).resolves.toEqual([
          "packages/core/README.md",
          "packages/web/README.md",
        ]);
      },
    );
  });

  it("filters broad matches to Markdown and MDX files", async () => {
    await withProject(
      {
        "guide.md": "# Guide\n",
        "guide.mdx": "# Guide\n",
        "notes.txt": "Notes\n",
      },
      async (projectRoot) => {
        await expect(
          documentPaths(projectRoot, {
            documentGlobs: ["**/*"],
          }),
        ).resolves.toEqual(["guide.md", "guide.mdx"]);
      },
    );
  });

  it("ignores matching directories", async () => {
    await withProject(
      {
        "guides/guide.md": "# Guide\n",
      },
      async (projectRoot) => {
        await mkdir(join(projectRoot, "guides", "empty.md"));

        await expect(
          documentPaths(projectRoot, {
            documentGlobs: ["guides/**"],
          }),
        ).resolves.toEqual(["guides/guide.md"]);
      },
    );
  });

  it("uses custom documentGlobs instead of the defaults", async () => {
    await withProject(
      {
        "README.md": "# Readme\n",
        "CONTRIBUTING.md": "# Contributing\n",
        "docs/config.md": "# Config\n",
        "driftfence.config.json": jsonConfig({
          documentGlobs: ["CONTRIBUTING.md"],
        }),
      },
      async (projectRoot) => {
        const result = await checkProject(projectRoot);

        expect(result.markdownDocuments.map((document) => document.path)).toEqual([
          "CONTRIBUTING.md",
        ]);
        expect(formatReport(result)).toBe(
          "DriftFence: no documentation drift found.\nChecked CONTRIBUTING.md.",
        );
      },
    );
  });

  it("excludes custom documents with ignoreDocumentGlobs", async () => {
    await withProject(
      {
        "guides/current.md": "# Current\n",
        "guides/archive/old.md": "# Old\n",
        "driftfence.config.json": jsonConfig({
          documentGlobs: ["guides/**/*.md"],
          ignoreDocumentGlobs: ["guides/archive/**"],
        }),
      },
      async (projectRoot) => {
        await expect(checkedDocumentPaths(projectRoot)).resolves.toEqual([
          "guides/current.md",
        ]);
      },
    );
  });

  it("applies ignoreDocumentGlobs to the default document patterns", async () => {
    await withProject(
      {
        "README.md": "# Readme\n",
        "docs/config.md": "# Config\n",
        "docs/generated/api.md": "# Generated\n",
        "driftfence.config.json": jsonConfig({
          ignoreDocumentGlobs: ["docs/generated/**"],
        }),
      },
      async (projectRoot) => {
        await expect(checkedDocumentPaths(projectRoot)).resolves.toEqual([
          "README.md",
          "docs/config.md",
        ]);
      },
    );
  });

  it("deduplicates documents and issues from overlapping patterns", async () => {
    await withProject(
      {
        "guides/guide.md": "See `missing.md`.\n",
        "driftfence.config.json": jsonConfig({
          documentGlobs: ["guides/**/*.md", "guides/guide.md"],
        }),
      },
      async (projectRoot) => {
        const result = await checkProject(projectRoot);

        expect(result.markdownDocuments.map((document) => document.path)).toEqual([
          "guides/guide.md",
        ]);
        expect(result.issues).toEqual([
          {
            type: "file-path",
            path: "missing.md",
            markdownPath: "guides/guide.md",
          },
        ]);
      },
    );
  });

  it("returns documents in deterministic lexicographic order", async () => {
    await withProject(
      {
        "a.md": "# A\n",
        "z.md": "# Z\n",
        "guides/a.md": "# Guide A\n",
        "guides/z.md": "# Guide Z\n",
      },
      async (projectRoot) => {
        await expect(
          documentPaths(projectRoot, {
            documentGlobs: ["z.md", "guides/**/*.md", "a.md"],
          }),
        ).resolves.toEqual(["a.md", "guides/a.md", "guides/z.md", "z.md"]);
      },
    );
  });

  it("normalizes Windows separators in configured patterns", async () => {
    await withProject(
      {
        "guides/setup/install.md": "# Install\n",
        "driftfence.config.json": jsonConfig({
          documentGlobs: ["guides\\**\\*.md"],
        }),
      },
      async (projectRoot) => {
        await expect(checkedDocumentPaths(projectRoot)).resolves.toEqual([
          "guides/setup/install.md",
        ]);
      },
    );
  });

  it("parses document globs from a BOM-prefixed config", async () => {
    await withProject(
      {
        "CONTRIBUTING.md": "# Contributing\n",
        "driftfence.config.json": `\uFEFF${jsonConfig({
          documentGlobs: ["CONTRIBUTING.md"],
        })}`,
      },
      async (projectRoot) => {
        await expect(checkedDocumentPaths(projectRoot)).resolves.toEqual([
          "CONTRIBUTING.md",
        ]);
      },
    );
  });

  it("does not scan node_modules with a broad pattern", async () => {
    await withProject(
      {
        "guide.md": "# Guide\n",
        "node_modules/dependency/README.md": "# Dependency\n",
      },
      async (projectRoot) => {
        await expect(
          documentPaths(projectRoot, {
            documentGlobs: ["**/*.md"],
          }),
        ).resolves.toEqual(["guide.md"]);
      },
    );
  });

  it("does not scan .git with a broad pattern", async () => {
    await withProject(
      {
        "guide.md": "# Guide\n",
        ".git/internal.md": "# Internal\n",
      },
      async (projectRoot) => {
        await expect(
          documentPaths(projectRoot, {
            documentGlobs: ["**/*.md"],
          }),
        ).resolves.toEqual(["guide.md"]);
      },
    );
  });

  it("reports an absolute document pattern as a config issue", async () => {
    await expectConfigIssue(
      { documentGlobs: ["/outside/**/*.md"] },
      "absolute paths are not allowed",
    );
  });

  it("reports a Windows drive-letter pattern as a config issue", async () => {
    await expectConfigIssue(
      { documentGlobs: ["C:\\outside\\**\\*.md"] },
      "absolute paths are not allowed",
    );
  });

  it("reports a parent traversal pattern as a config issue", async () => {
    await expectConfigIssue(
      { documentGlobs: ["../outside/**/*.md"] },
      "parent traversal is not allowed",
    );
  });

  it("reports a UNC pattern as a config issue", async () => {
    await expectConfigIssue(
      { documentGlobs: ["\\\\server\\share\\**\\*.md"] },
      "UNC paths are not allowed",
    );
  });

  it("reports an unsafe ignoreDocumentGlobs pattern as a config issue", async () => {
    await expectConfigIssue(
      { ignoreDocumentGlobs: ["../outside/**"] },
      "unsafe ignoreDocumentGlobs pattern",
    );
  });

  it("does not follow a document symlink or junction outside the project", async (context) => {
    const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-project-"));
    const externalRoot = await mkdtemp(join(tmpdir(), "driftfence-external-"));

    try {
      await writeProjectFile(projectRoot, "local.md", "# Local\n");
      await writeProjectFile(
        projectRoot,
        "driftfence.config.json",
        jsonConfig({ documentGlobs: ["**/*.md"] }),
      );
      await writeProjectFile(externalRoot, "outside.md", "# Outside\n");

      try {
        await symlink(
          externalRoot,
          join(projectRoot, "linked"),
          process.platform === "win32" ? "junction" : "dir",
        );
      } catch (error) {
        if (isSymlinkCreationUnavailable(error)) {
          context.skip();
          return;
        }

        throw error;
      }

      await expect(checkedDocumentPaths(projectRoot)).resolves.toEqual([
        "local.md",
      ]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
      await rm(externalRoot, { recursive: true, force: true });
    }
  });

  it("runs existing checkers against custom documents", async () => {
    await withProject(
      {
        "CONTRIBUTING.md": [
          "Run `npm run build`.",
          "See `docs/missing.md`.",
          "[Missing](missing-link.md)",
          "Set `CUSTOM_API_URL`.",
          "",
        ].join("\n"),
        "package.json": jsonConfig({ scripts: {} }),
        "driftfence.config.json": jsonConfig({
          documentGlobs: ["CONTRIBUTING.md"],
        }),
      },
      async (projectRoot) => {
        const result = await checkProject(projectRoot);

        expect(result.markdownDocuments.map((document) => document.path)).toEqual([
          "CONTRIBUTING.md",
        ]);
        expect(result.issues).toEqual([
          {
            type: "package-script",
            path: "CONTRIBUTING.md",
            command: "npm run build",
            script: "build",
          },
          {
            type: "file-path",
            path: "docs/missing.md",
            markdownPath: "CONTRIBUTING.md",
          },
          {
            type: "file-path",
            path: "missing-link.md",
            markdownPath: "CONTRIBUTING.md",
            resolvedPath: "missing-link.md",
          },
          {
            type: "env-var",
            name: "CUSTOM_API_URL",
            source: "markdown",
            path: "CONTRIBUTING.md",
          },
        ]);
      },
    );
  });

  it("handles malformed document glob fields without throwing", async () => {
    await withProject(
      {
        "README.md": "# Readme\n",
        "docs/config.md": "# Config\n",
        "driftfence.config.json": jsonConfig({
          documentGlobs: "CONTRIBUTING.md",
          ignoreDocumentGlobs: { docs: true },
          unknownField: true,
        }),
      },
      async (projectRoot) => {
        await expect(checkedDocumentPaths(projectRoot)).resolves.toEqual([
          "README.md",
          "docs/config.md",
        ]);
      },
    );
  });
});

async function documentPaths(
  projectRoot: string,
  options: Parameters<typeof readMarkdownDocuments>[1],
): Promise<string[]> {
  return (await readMarkdownDocuments(projectRoot, options)).map(
    (document) => document.path,
  );
}

async function checkedDocumentPaths(projectRoot: string): Promise<string[]> {
  return (await checkProject(projectRoot)).markdownDocuments.map(
    (document) => document.path,
  );
}

async function expectConfigIssue(
  config: Record<string, unknown>,
  expectedReason: string,
): Promise<void> {
  await withProject(
    {
      "driftfence.config.json": jsonConfig(config),
    },
    async (projectRoot) => {
      const result = await checkProject(projectRoot);

      expect(result.issues).toEqual([
        {
          type: "config",
          path: "driftfence.config.json",
          message: expect.stringContaining(expectedReason),
        },
      ]);
    },
  );
}

async function withProject(
  files: Record<string, string>,
  callback: (projectRoot: string) => Promise<void>,
): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-"));

  try {
    for (const [path, content] of Object.entries(files)) {
      await writeProjectFile(projectRoot, path, content);
    }

    await callback(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function writeProjectFile(
  projectRoot: string,
  path: string,
  content: string,
): Promise<void> {
  const absolutePath = join(projectRoot, path);

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

function jsonConfig(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isSymlinkCreationUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return ["EACCES", "ENOTSUP", "EPERM"].includes(String(error.code));
}
