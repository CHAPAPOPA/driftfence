import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkProject } from "../src/index.js";
import { formatReport } from "../src/report/formatReport.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixturesDirectory = join(testDirectory, "fixtures");

describe("config", () => {
  it("keeps current behavior when config is missing", async () => {
    const result = await checkProject(
      join(fixturesDirectory, "basic-drift-project"),
    );

    expect(result.issues).toEqual([
      {
        type: "package-script",
        path: "README.md",
        command: "npm run build",
        script: "build",
      },
      {
        type: "file-path",
        path: "docs/missing.md",
        markdownPath: "README.md",
      },
      {
        type: "file-path",
        path: "docs/advanced.md",
        markdownPath: "docs/config.md",
      },
      {
        type: "env-var",
        name: "DATABASE_URL",
        source: "source",
        path: "src/index.ts",
      },
    ]);
  });

  it("ignorePaths suppresses matching file path issues", async () => {
    await withProject(
      {
        "README.md": "See `docs/missing.md`.\n",
        "driftfence.config.json": jsonConfig({
          ignorePaths: ["docs/missing.md"],
        }),
      },
      async (projectRoot) => {
        await expect(checkProject(projectRoot)).resolves.toMatchObject({
          issues: [],
        });
      },
    );
  });

  it("ignoreEnvVars suppresses matching env var issues", async () => {
    await withProject(
      {
        "README.md": "Set `DATABASE_URL`.\n",
        "driftfence.config.json": jsonConfig({
          ignoreEnvVars: ["DATABASE_URL"],
        }),
      },
      async (projectRoot) => {
        await expect(checkProject(projectRoot)).resolves.toMatchObject({
          issues: [],
        });
      },
    );
  });

  it("ignorePackageScripts suppresses matching package script issues", async () => {
    await withProject(
      {
        "README.md": "Run `npm start`.\n",
        "package.json": jsonConfig({ scripts: {} }),
        "driftfence.config.json": jsonConfig({
          ignorePackageScripts: ["start"],
        }),
      },
      async (projectRoot) => {
        await expect(checkProject(projectRoot)).resolves.toMatchObject({
          issues: [],
        });
      },
    );
  });

  it("reports invalid config JSON as a project issue", async () => {
    await withProject(
      {
        "driftfence.config.json": "{ invalid json\n",
      },
      async (projectRoot) => {
        const result = await checkProject(projectRoot);

        expect(result.issues).toEqual([
          {
            type: "config",
            path: "driftfence.config.json",
            message: expect.stringContaining(
              "driftfence.config.json is not valid JSON:",
            ),
          },
        ]);
        expect(formatReport(result)).toContain(
          "Project:\n- driftfence.config.json is not valid JSON:",
        );
      },
    );
  });

  it("normalizes Windows-style paths in config", async () => {
    await withProject(
      {
        "README.md": "See `docs/missing.md`.\n",
        "driftfence.config.json": jsonConfig({
          ignorePaths: ["docs\\missing.md"],
        }),
      },
      async (projectRoot) => {
        await expect(checkProject(projectRoot)).resolves.toMatchObject({
          issues: [],
        });
      },
    );
  });
});

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
