import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkPackageScripts,
  findPackageScriptReferences,
} from "../src/checkers/packageScripts.js";
import {
  extractMarkdownText,
  type MarkdownTextReferenceWithPath,
} from "../src/markdown/extractMarkdownText.js";

describe("package script checker", () => {
  it("reports referenced npm scripts missing from package.json", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-"));

    try {
      await writeFile(
        join(projectRoot, "package.json"),
        JSON.stringify({ scripts: { dev: "vite", test: "vitest run" } }),
      );

      const references = markdownReferences(`
Run \`npm run dev\`, \`npm test\`, \`npm start\`, and \`npm run build\`.

\`\`\`sh
pnpm install
pnpm dev
\`\`\`
`);

      await expect(checkPackageScripts(projectRoot, references)).resolves.toEqual([
        {
          type: "package-script",
          path: "README.md",
          command: "npm start",
          script: "start",
        },
        {
          type: "package-script",
          path: "README.md",
          command: "npm run build",
          script: "build",
        },
      ]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("does not report npm start when package.json has a start script", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-"));

    try {
      await writeFile(
        join(projectRoot, "package.json"),
        JSON.stringify({ scripts: { start: "node src/index.js" } }),
      );

      const references = markdownReferences("Run `npm start`.");

      await expect(checkPackageScripts(projectRoot, references)).resolves.toEqual(
        [],
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("finds npm start script references", () => {
    const references = markdownReferences("Run `npm start`.", "docs/config.md");

    expect(findPackageScriptReferences(references)).toEqual([
      {
        path: "docs/config.md",
        command: "npm start",
        packageManager: "npm",
        script: "start",
      },
    ]);
  });

  it("finds pnpm and yarn shorthand script references", () => {
    const references = markdownReferences("Use `pnpm dev` and `yarn build`.");

    expect(findPackageScriptReferences(references)).toEqual([
      {
        path: "README.md",
        command: "pnpm dev",
        packageManager: "pnpm",
        script: "dev",
      },
      {
        path: "README.md",
        command: "yarn build",
        packageManager: "yarn",
        script: "build",
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
