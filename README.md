# manage-funding-yml

GitHub Action that automatically creates or updates FUNDING.yml files in wishlist projects tracked in [oss-wishlist/wishlists](https://github.com/oss-wishlist/wishlists).

## What it does

When an issue in the wishlists repository is labeled with `funding-yml-requested`, this action:

1. Parses the issue to extract the project repository and maintainer information
2. Checks if the target repository has a FUNDING.yml file (in `.github/` or root)
3. Creates a pull request to add or update the FUNDING.yml with the wishlist link
4. Adds tracking (label + comment) to prevent duplicate processing

## Usage

### In the wishlists repository

Add this workflow to `.github/workflows/manage-funding-yml.yml`:

```yaml
name: Manage FUNDING.yml

on:
  issues:
    types: [opened, labeled]

jobs:
  create-funding-pr:
    if: contains(github.event.issue.labels.*.name, 'funding-yml-requested')
    runs-on: ubuntu-latest
    
    steps:
      - name: Manage FUNDING.yml
        uses: oss-wishlist/manage-funding-yml@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token with repo permissions | Yes | `${{ github.token }}` |

### Outputs

| Output | Description |
|--------|-------------|
| `pr-url` | URL of the created pull request |
| `status` | Status of the action (`success`, `skipped`, or `error`) |

## Development

### Setup

```bash
npm install
```

### Build

The action needs to be compiled before use:

```bash
npm run build
```

This creates `dist/index.js` which is committed to the repository.

### Testing locally

You can test the action locally using [act](https://github.com/nektos/act):

```bash
act issues -e test-event.json
```

## How it works

### Issue parsing

The action looks for wishlist data in this order:

1. **Check comments**: Look for the most recent comment starting with "📝 Wishlist Updated"
2. **Fallback to issue body**: If no update comments exist, parse the issue body

It extracts:
- `### Maintainer GitHub Username` → maintainer handle
- `### Project Repository` → target repository URL
- Issue URL → wishlist link to add to FUNDING.yml

### Idempotency

The action tracks processed issues using:
- A label: `funding-yml-processed`
- A hidden HTML comment: `<!-- funding-yml-pr: <url> -->`

If either is present, the action skips processing.

### Error handling

If any errors occur (parsing failures, API errors, etc.), the action creates an issue in this repository with full error details for investigation.

## License

MIT
