# manage-funding-yml

GitHub Action that automatically creates or updates FUNDING.yml files in wishlist projects tracked in [oss-wishlist/wishlists](https://github.com/oss-wishlist/wishlists).

## What it does

When an issue in the wishlists repository is labeled with `funding-yml-requested`, this action:

1. Parses the issue to extract the project repository and maintainer information
2. Checks if the target repository has a FUNDING.yml file (in `.github/` or root)
3. Creates a pull request to add or update the FUNDING.yml with the wishlist link
4. Adds tracking (label + comment) to prevent duplicate processing

## Usage

### Prerequisites

**Important**: This action needs to create PRs in external repositories (the wishlist projects), so it requires a Personal Access Token (PAT) with appropriate permissions.

#### Recommended: Create a Bot Account

For a professional appearance (PRs from `@oss-wishlist-bot` instead of your personal account):

1. **Create a new GitHub account**
   - Sign up at https://github.com/signup
   - Username suggestion: `oss-wishlist-bot`
   - Use an email like `bot@your-org.com` or create a free email account

2. **Add bot to organization** (optional but recommended)
   - Go to https://github.com/orgs/oss-wishlist/people
   - Invite `oss-wishlist-bot` as a member
   - No special permissions needed - regular member is fine

3. **Create a Personal Access Token from the bot account**
   - Log in as the bot account
   - Go to **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
   - Click **Generate new token (classic)**
   - Name: `Wishlist FUNDING.yml Manager`
   - Scopes: Check **public_repo** (or full **repo** if you need private repo support)
   - Click **Generate token** and copy it immediately

4. **Add token to wishlists repository secrets**
   - In the `oss-wishlist/wishlists` repository, go to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `WISHLIST_BOT_TOKEN`
   - Value: Paste the token from step 3
   - Click **Add secret**

**Result**: All PRs and comments will appear to come from `@oss-wishlist-bot` instead of a personal account.

#### Alternative: Use Your Personal Account

If you prefer, you can use your personal account token:
1. Create a PAT from your account with `public_repo` scope
2. Store as `WISHLIST_BOT_TOKEN` secret
3. PRs will be created as you (@emmairwin)

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
    
    permissions:
      issues: write
      contents: read
    
    steps:
      - name: Manage FUNDING.yml
        uses: oss-wishlist/manage-funding-yml@v1
        with:
          github-token: ${{ secrets.WISHLIST_BOT_TOKEN }}
```

**Note**: The default `GITHUB_TOKEN` will not work because it only has permissions for the wishlists repository, not the external project repositories.

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | Personal Access Token with `public_repo` scope (cannot use default `GITHUB_TOKEN`) | Yes | N/A |

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
