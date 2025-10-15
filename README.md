# manage-funding-yml

A GitHub Action that automatically manages FUNDING.yml files for OSS Wishlist projects.

## What it does

This action monitors issues in the [oss-wishlist/wishlists](https://github.com/oss-wishlist/wishlists) repository with the label `funding-yml-requested`. For each issue, it:

1. Extracts the repository URL from the issue body (looks for "Repository: ...")
2. Checks if `.github/FUNDING.yml` exists in the target repository
3. Creates a PR that either:
   - Adds `oss-wishlist: [issue url]` to existing FUNDING.yml
   - Creates a new FUNDING.yml with that line if it doesn't exist

## Usage

### As a Workflow

Create a workflow file (e.g., `.github/workflows/process-funding-requests.yml`):

```yaml
name: Process Funding Requests

on:
  schedule:
    # Run every hour
    - cron: '0 * * * *'
  workflow_dispatch:

jobs:
  process-funding-requests:
    runs-on: ubuntu-latest
    name: Process FUNDING.yml requests
    steps:
      - name: Process funding requests
        uses: oss-wishlist/manage-funding-yml@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          wishlists-repo: 'oss-wishlist/wishlists'
          label: 'funding-yml-requested'
```

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for API access (needs repo and workflow scopes for creating PRs in target repos) | Yes | - |
| `wishlists-repo` | Repository containing wishlist issues | No | `oss-wishlist/wishlists` |
| `label` | Label to filter issues by | No | `funding-yml-requested` |

### Required Permissions

The GitHub token used must have the following permissions:
- `repo` scope to create branches and files in target repositories
- `workflow` scope if target repositories have workflow files
- Access to both the wishlists repository and target repositories

**Note:** The default `GITHUB_TOKEN` only has access to the repository where the workflow runs. To create PRs in other repositories, you'll need to use a Personal Access Token (PAT) or GitHub App token with appropriate permissions.

## Issue Format

The action expects issues in the wishlists repository to contain a line like:

```
Repository: owner/repo
```

or

```
Repository: https://github.com/owner/repo
```

## License

MIT
