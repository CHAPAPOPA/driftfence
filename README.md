# DriftFence

Make sure your README doesn't lie.

DriftFence is a TypeScript Node.js CLI that catches outdated README commands, package scripts, and file references before they reach users.

## Install

Placeholder npm command:

```sh
npm install -D driftfence
```

## Usage

```sh
npx driftfence check
```

```sh
npx driftfence check ./path/to/project
```

## Example Output

The local clean demo exits with code 0:

```sh
npm run demo:clean
```

The local drift demo intentionally contains documentation drift and exits with code 1:

```sh
npm run demo:drift
```

Example output from that fixture:

```text
DriftFence found documentation drift.

Package scripts:
- `npm run build` references missing package.json script `build`.

File paths:
- docs/missing.md does not exist.

2 issues found.
```

## MVP Checks

DriftFence checks README.md for:

- package script references
- file path references

## Roadmap

- env vars
- Markdown/MDX docs beyond README
- GitHub Action
- changed-files mode

## AI

AI features are not included in the MVP.
