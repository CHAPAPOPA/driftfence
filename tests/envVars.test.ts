import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkEnvVars,
  findEnvExampleNames,
} from "../src/checkers/envVars.js";
import type { MarkdownDocument } from "../src/markdown/readMarkdownDocuments.js";

describe("env var checker", () => {
  it("extracts env var names from .env.example content", () => {
    expect(
      findEnvExampleNames(`
# ignored
API_URL=
DATABASE_URL=value
VITE_API_URL=http://localhost:3000
lowercase_value=ignored
`),
    ).toEqual(new Set(["API_URL", "DATABASE_URL", "VITE_API_URL"]));
  });

  it("reports markdown env vars missing from .env.example", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-"));

    try {
      await writeFile(join(projectRoot, ".env.example"), "API_URL=\n");

      await expect(
        checkEnvVars(projectRoot, [
          markdownDocument(
            "docs/config.md",
            "Configure API_URL and DATABASE_URL.",
          ),
        ]),
      ).resolves.toEqual([
        {
          type: "env-var",
          name: "DATABASE_URL",
          source: "markdown",
          path: "docs/config.md",
        },
      ]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("reports source env vars missing from .env.example", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-"));

    try {
      await mkdir(join(projectRoot, "src"));
      await writeFile(join(projectRoot, ".env.example"), "API_URL=\n");
      await writeFile(
        join(projectRoot, "src", "index.ts"),
        [
          "process.env.API_URL;",
          "process.env.DATABASE_URL;",
          "import.meta.env.VITE_API_URL;",
        ].join("\n"),
      );

      await expect(checkEnvVars(projectRoot, [])).resolves.toEqual([
        {
          type: "env-var",
          name: "DATABASE_URL",
          source: "source",
          path: "src/index.ts",
        },
        {
          type: "env-var",
          name: "VITE_API_URL",
          source: "source",
          path: "src/index.ts",
        },
      ]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("reports env vars when .env.example is missing", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-"));

    try {
      await expect(
        checkEnvVars(projectRoot, [markdownDocument("README.md", "Use API_URL.")]),
      ).resolves.toEqual([
        {
          type: "env-var",
          name: "API_URL",
          source: "markdown",
          path: "README.md",
        },
      ]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("ignores markdown env vars inside driftfence ignore blocks", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-"));

    try {
      await expect(
        checkEnvVars(projectRoot, [
          markdownDocument(
            "README.md",
            [
              "<!-- driftfence-ignore-start -->",
              "Use DATABASE_URL.",
              "<!-- driftfence-ignore-end -->",
            ].join("\n"),
          ),
        ]),
      ).resolves.toEqual([]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

function markdownDocument(path: string, content: string): MarkdownDocument {
  return {
    path,
    content,
    references: [],
  };
}
