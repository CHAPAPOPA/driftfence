# DriftFence

[![CI](https://github.com/CHAPAPOPA/driftfence/actions/workflows/ci.yml/badge.svg)](https://github.com/CHAPAPOPA/driftfence/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/driftfence.svg)](https://www.npmjs.com/package/driftfence)

Make sure your README doesn't lie.

DriftFence is a TypeScript Node.js CLI that catches outdated README and docs commands, package scripts, file references, and env var references before they reach users.

## Install

Install from npm:

```sh
npm install -D driftfence
```

## Usage

Check the current project:

```sh
npx driftfence check
```

Check a specific project directory:

<!-- driftfence-ignore-start -->

```sh
npx driftfence check ./path/to/project
```

<!-- driftfence-ignore-end -->

## Example Output

The local clean demo exits with code 0:

```sh
npm run demo:clean
```

The local drift demo intentionally contains documentation drift and exits with code 1:

```sh
npm run demo:drift
```

Example output from the drift fixture:

<!-- driftfence-ignore-start -->

```text
DriftFence found documentation drift.

Package scripts:
- `npm run build` in README.md references missing package.json script `build`.

File paths:
- `docs/missing.md` referenced in README.md does not exist.
- `docs/advanced.md` referenced in docs/config.md does not exist.

Env vars:
- `DATABASE_URL` is used in src/index.ts but missing from .env.example.

4 issues found.
```

<!-- driftfence-ignore-end -->

## MVP Checks

DriftFence checks `README.md` and `docs/**/*.md` for documentation drift.

Current checks:

- package script references
- file path references
- env var references in Markdown docs
- env var usage in source files

Package script references include commands like:

<!-- driftfence-ignore-start -->

```sh
npm run build
npm test
npm start
pnpm build
yarn build
```

<!-- driftfence-ignore-end -->

Env var checks currently support references like:

<!-- driftfence-ignore-start -->

```text
API_URL
DATABASE_URL
VITE_API_URL
```

<!-- driftfence-ignore-end -->

and source usages like:

<!-- driftfence-ignore-start -->

```ts
process.env.API_URL
import.meta.env.VITE_API_URL
```

<!-- driftfence-ignore-end -->

## Exit Codes

DriftFence uses stable CLI exit codes:

- `0` — no documentation drift found
- `1` — documentation drift found
- `2` — invalid project directory or CLI usage error

## Ignoring intentional examples

Use ignore blocks when docs intentionally show fake paths, broken commands, fake env vars, or sample DriftFence output.

````md
<!-- driftfence-ignore-start -->

```sh
npm run missing-script
```

See `docs/missing.md`.
Set `DATABASE_URL`.

<!-- driftfence-ignore-end -->
````

Keep ignore blocks narrow so real setup instructions are still checked.

## Roadmap

- MDX docs
- GitHub Action
- changed-files mode
- configurable ignore rules
- richer source analysis

## AI

AI features are not included in the MVP.

DriftFence is deterministic-first: it checks concrete references in docs and code instead of guessing.
