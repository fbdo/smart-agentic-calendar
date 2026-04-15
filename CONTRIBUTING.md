# Contributing to Smart Agentic Calendar

Thanks for your interest in contributing! This document covers how to report issues, suggest features, and submit code changes.

## Code of Conduct

Be respectful and constructive. We're all here to build something useful together.

## Reporting Bugs

Open an issue on the [GitHub issue tracker](https://github.com/fbdo/smart-agentic-calendar/issues) and include:

- A clear, descriptive title
- Steps to reproduce the problem
- Expected behavior vs. actual behavior
- Your environment (Node.js version, OS, MCP client)
- Any relevant log output (run with `LOG_LEVEL=debug` to get full diagnostics)

## Requesting Features

Also via [GitHub Issues](https://github.com/fbdo/smart-agentic-calendar/issues). Describe:

- The use case — what are you trying to accomplish?
- Why existing tools/features don't cover it
- Any ideas for how it could work

## Finding Contributions to Work On

- Look for issues labeled [`good first issue`](https://github.com/fbdo/smart-agentic-calendar/labels/good%20first%20issue) or [`help wanted`](https://github.com/fbdo/smart-agentic-calendar/labels/help%20wanted)
- Browse open issues and ask questions if anything is unclear
- Small fixes (typos, docs, error messages) are always welcome

## Development Setup

### Prerequisites

- Node.js >= 20

### Install and Build

```bash
npm install
npm run build
```

This compiles TypeScript to `dist/` and produces the runnable server at `dist/index.js`.

### Test

```bash
npm test              # run all tests (578 tests)
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

### Quality Checks

```bash
npm run lint          # eslint
npm run format:check  # prettier
npm run quality       # all checks (lint, format, duplication, unused code, dependency rules, security)
```

## Submitting Pull Requests

1. Fork the repository and create a branch from `main`
2. Make your changes
3. Ensure all tests pass (`npm test`) and quality checks pass (`npm run quality`)
4. Write or update tests for your changes
5. Open a pull request against `main`

In your PR description:

- Describe what changed and why
- Link any related issues (e.g., "Fixes #42")
- Note any breaking changes

### Coding Standards

- **TypeScript strict mode** — no `any` types, no implicit returns
- **Test-driven development** — red-green-refactor; write the failing test first
- **Healthy test pyramid** — unit tests for logic, integration tests for storage/engine interactions
- **Dependency injection** — keep components testable by injecting dependencies
- Existing lint and format rules are enforced via `npm run quality`

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
