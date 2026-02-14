# GitHub Workflow

This repository follows a branch + PR workflow for all changes.

## Branches

- `main` = production-ready code
- `develop` = integration branch for ongoing work
- Feature branches = all implementation work

## Branch naming

Use this format:

- `feat/<short-topic>`
- `fix/<short-topic>`
- `chore/<short-topic>`
- `docs/<short-topic>`
- `refactor/<short-topic>`

Examples:

- `feat/add-keyword-clustering`
- `fix/auth-token-refresh`
- `chore/upgrade-deps`

## Commit message style

Use clear, descriptive conventional commits:

- `feat(api): add endpoint for rank snapshot filters`
- `fix(web): prevent dashboard crash on empty project list`
- `chore(ci): cache pnpm store in GitHub Actions`

## PR process

1. Sync branch from `develop` (or `main` if hotfix).
2. Create feature branch.
3. Make small, descriptive commits.
4. Push branch to GitHub.
5. Open PR into `develop` (or `main` for hotfixes).
6. Ensure CI is green.
7. Merge PR.

## Local command sequence

```bash
git checkout develop
git pull origin develop
git checkout -b feat/my-change
# ...edit files...
git add .
git commit -m "feat(scope): describe change"
git push -u origin feat/my-change
```

## Merge strategy

- Prefer **Squash and merge** for cleaner history.
- Keep PRs focused and reasonably small.
- Include rollback notes when changing infra/db.
