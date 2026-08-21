# Contributing to KINBAN

Thank you for helping improve KINBAN. The project is in an early alpha stage, so focused reports and small, reviewable changes are especially useful.

## Before opening an issue

- Search existing Issues and Discussions first.
- Do not include real personal information, credentials, API keys, or production data.
- Use a private security report for vulnerabilities; do not publish exploit details in an Issue.

## Issues and Discussions

- Issues: reproducible bugs, concrete feature proposals, and implementation tasks.
- Discussions: questions, operational examples, design alternatives, and general feedback.
- Include the version or commit, environment, reproduction steps, expected result, and actual result when reporting a bug.

## Pull requests

1. Create a focused branch from `main`.
2. Keep unrelated formatting and generated artifacts out of the change.
3. Add or update contract tests for behavior changes.
4. Run `npm test` and `npm run build` locally when applicable.
5. Explain data migrations, seed changes, and deployment-specific settings in the pull request.

The `main` branch should remain buildable. Force-pushes to shared branches are discouraged.

## Local setup

See the root [README](README.md). Keep local `.env` files and deployment secrets outside Git.

## License

By submitting a contribution, you agree that it may be distributed under the Apache-2.0 license used by this project.
