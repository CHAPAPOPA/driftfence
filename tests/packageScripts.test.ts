import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkPackageScripts,
  findPackageScriptReferences,
} from "../src/checkers/packageScripts.js";
import { extractMarkdownText } from "../src/markdown/extractMarkdownText.js";

describe("package script checker", () => {
  it("reports referenced npm scripts missing from package.json", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "driftfence-"));

    try {
      await writeFile(
        join(projectRoot, "package.json"),
        JSON.stringify({ scripts: { dev: "vite", test: "vitest run" } }),
      );

      const references = extractMarkdownText(`
Run \`npm run dev\`, \`npm test\`, and \`npm run build\`.

\`\`\`sh
pnpm install
pnpm dev
\`\`\`
`);

      await expect(checkPackageScripts(projectRoot, references)).resolves.toEqual([
        {
          type: "package-script",
          command: "npm run build",
          script: "build",
        },
      ]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("finds pnpm and yarn shorthand script references", () => {
    const references = extractMarkdownText("Use `pnpm dev` and `yarn build`.");

    expect(findPackageScriptReferences(references)).toEqual([
      {
        command: "pnpm dev",
        packageManager: "pnpm",
        script: "dev",
      },
      {
        command: "yarn build",
        packageManager: "yarn",
        script: "build",
      },
    ]);
  });
});
