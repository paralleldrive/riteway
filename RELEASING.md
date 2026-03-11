# Releasing Riteway

This document describes the release process for the `riteway` npm package.

Releases are semi-automated using [`release-it`](https://github.com/release-it/release-it) via a custom `release.js` wrapper script. One command handles the full workflow: running tests, bumping the version, committing, tagging, pushing, creating a GitHub release, and publishing to npm.

## Prerequisites

Before cutting a release, make sure you have:

1. **npm publish access** — you must be a member of the `riteway` package on npmjs.com with publish rights.
2. **GitHub token** — `release-it` uses the `GITHUB_TOKEN` environment variable to create GitHub releases. Set it in your shell:
   ```sh
   export GITHUB_TOKEN=ghp_your_token_here
   ```
   The token needs `repo` scope (or `public_repo` for public repos).
3. **npm auth** — ensure you are logged in to npm:
   ```sh
   npm whoami   # should print your npm username
   ```
   If not logged in: `npm login`

## Allowed Release Branches

Releases may only be cut from one of these branches:

- `main`
- `master`
- `release`

Attempting to release from any other branch will abort with an error.

## Clean Working Directory

Your working directory must be clean (no uncommitted changes) before running a release. Commit or stash everything first:

```sh
git status   # should show "nothing to commit, working tree clean"
```

## Running a Release

```sh
npm run release [<bump-type>]
```

### Bump Types

| Alias | Semver | When to use |
|---|---|---|
| `breaking` or `major` | `major` | Breaking API changes (e.g. `1.0.0` → `2.0.0`) |
| `feature` or `minor` | `minor` | New backwards-compatible features (e.g. `1.0.0` → `1.1.0`) |
| `fix` or `patch` | `patch` | Bug fixes and minor updates (e.g. `1.0.0` → `1.0.1`) |

If no bump type is provided, `minor` is used by default.

### Examples

```sh
npm run release              # minor bump (default)
npm run release feature      # minor bump
npm run release breaking     # major bump
npm run release fix          # patch bump
npm run release patch        # patch bump
npm run release major        # major bump
```

Run `npm run release --help` to print usage at any time.

## What Happens During a Release

The script runs the following steps automatically (no interactive prompts — it runs in `--ci` mode):

1. **Validate** — confirms bump type and current branch are allowed
2. **Run tests** — `npm test` must pass; the release aborts if any tests fail
3. **Bump version** — increments the version in `package.json`
4. **Commit** — creates a git commit: `chore(release): v<version>`
5. **Tag** — creates an annotated git tag: `v<version>`
6. **Push** — pushes the commit and tag to `origin`
7. **GitHub release** — creates a GitHub release named `v<version>` with an auto-generated compact changelog
8. **Publish to npm** — publishes the package to the npm registry
9. **Confirm** — prints `🎉 Successfully released riteway v<version>`

## Dry Run

`release-it` supports a `--dry-run` mode that simulates the full release without touching git, npm, or GitHub — useful for verifying what version would be bumped and what commands would run.

The `release.js` wrapper does not currently expose this flag, so you need to call `release-it` directly:

```sh
# Simulate a patch release
npx release-it patch --dry-run

# Simulate a minor release
npx release-it minor --dry-run

# Simulate a major release
npx release-it major --dry-run
```

Note that `--dry-run` skips the `before:init` hook (i.e. `npm test` won't run), so the output focuses purely on the release steps themselves.

---

## Troubleshooting

| Error | Likely cause | Fix |
|---|---|---|
| `Not on allowed branch` | You're on a feature branch | Merge to `main` first |
| `requireCleanWorkingDir` | Uncommitted changes | `git stash` or commit your changes |
| `npm test` fails | Tests are broken | Fix the failing tests before releasing |
| GitHub release fails | Missing or invalid `GITHUB_TOKEN` | Export a valid token with `repo` scope |
| npm publish fails | Not authenticated or no publish rights | Run `npm login` or request publish access |

---

## Future Enhancements

### 1. Expose `--dry-run` in the release script

`release.js` should forward a `--dry-run` flag through to `release-it` so the full wrapper pipeline (alias normalisation, branch validation, etc.) can be simulated without having to invoke `npx release-it` directly:

```sh
npm run release fix --dry-run   # desired UX, not yet implemented
```

Implementation would involve detecting `--dry-run` in `process.argv`, skipping the branch/clean-dir assertions (since those would also fail in dry mode), and appending `--dry-run` to the `release-it` command.

### 2. Automated releases via GitHub Actions

Currently releases must be triggered manually from a local machine. A `workflow_dispatch` GitHub Actions workflow would let any maintainer cut a release directly from the GitHub UI with no local setup required.

Rough shape of the workflow:

```yaml
# .github/workflows/release.yml
name: Release

on:
  workflow_dispatch:
    inputs:
      bump:
        description: 'Bump type (breaking, feature, fix)'
        required: true
        default: 'feature'
        type: choice
        options: [breaking, feature, fix]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write   # push commits + tags
      id-token: write   # npm provenance (optional)
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
          cache: 'npm'

      - run: npm install --legacy-peer-deps

      - run: node release.js ${{ inputs.bump }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

The only secret that needs adding to the repo is `NPM_TOKEN` (a [granular npm access token](https://docs.npmjs.com/creating-and-viewing-access-tokens) scoped to the `riteway` package). `GITHUB_TOKEN` is provided automatically by Actions.
