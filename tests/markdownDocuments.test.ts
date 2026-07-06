import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkProject, readMarkdownDocuments } from "../src/index.js";
import { formatReport } from "../src/report/formatReport.js";

describe("markdown document discovery", () => {
  it("discovers README.md only", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-"));

    try {
      await writeFile(join(projectRoot, "README.md"), "# Readme\n");

      await expect(readMarkdownDocuments(projectRoot)).resolves.toMatchObject([
        { path: "README.md", content: "# Readme\n" },
      ]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("discovers docs markdown when README.md is missing", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-"));

    try {
      await mkdir(join(projectRoot, "docs", "setup"), { recursive: true });
      await writeFile(join(projectRoot, "docs", "config.md"), "# Config\n");
      await writeFile(
        join(projectRoot, "docs", "setup", "install.md"),
        "# Install\n",
      );

      const documents = await readMarkdownDocuments(projectRoot);

      expect(documents.map((document) => document.path)).toEqual([
        "docs/config.md",
        "docs/setup/install.md",
      ]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("discovers README.md before docs markdown", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-"));

    try {
      await mkdir(join(projectRoot, "docs"));
      await writeFile(join(projectRoot, "README.md"), "# Readme\n");
      await writeFile(join(projectRoot, "docs", "config.md"), "# Config\n");

      const documents = await readMarkdownDocuments(projectRoot);

      expect(documents.map((document) => document.path)).toEqual([
        "README.md",
        "docs/config.md",
      ]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("returns no issues and reports when no markdown files are found", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-"));

    try {
      const result = await checkProject(projectRoot);

      expect(result.markdownDocuments).toEqual([]);
      expect(result.issues).toEqual([]);
      expect(formatReport(result)).toBe("DriftFence: no Markdown files found.");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
