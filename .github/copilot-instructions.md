The repository: manage-funding-yml

## Purpose
This GitHub Action automates FUNDING.yml management for wishlist projects tracked in https://github.com/oss-wishlist/wishlists.

## What this action does (detailed workflow)
1. **Triggers**: Runs when issues in `oss-wishlist/wishlists` are opened or labeled with `funding-yml-requested`
2. **Parse issue**: Extract from issue body:
   - `Project Repository` field → target repository URL
   - `Maintainer GitHub user name` field → maintainer handle
   - Issue URL → the wishlist URL to add to FUNDING.yml
   - **Template format**: Issues contain structured fields like:
     ```
     ### Maintainer GitHub Username
     emmairwin
     
     ### Project Repository
     https://github.com/emmairwin/ai-alignment-tests
     ```
   - **Important**: Issues may be updated. Check comments for "📝 Wishlist Updated" prefix:
     - If NO comments with "📝 Wishlist Updated" exist → parse the issue body
     - If comments with "📝 Wishlist Updated" exist → use the LAST (most recent) such comment, ignore issue body
3. **Check FUNDING.yml**: Look for existing `FUNDING.yml` in target repo (check `.github/FUNDING.yml` first, then root `FUNDING.yml`). Performance matters for large codebases.
4. **Create or update PR**:
   - **If no FUNDING.yml exists**: Create new file with `custom: ['<WISHLIST_ISSUE_URL>']`
   - **If FUNDING.yml exists**: Add the line `custom: ['<WISHLIST_ISSUE_URL>']` (append to existing `custom` array if present, or create it)
   - **Note**: Only ONE wishlist per project/repo is allowed, so no duplication concerns
   - PR title: `Add wishlist link to FUNDING.yml`
   - PR body template:
     ```
     This PR was opened at the request of @<maintainer> to add a wishlist link to your repository's sponsor button.
     
     This will display the wishlist link in the "Sponsor this project" section of your repository.
     
     For more information about FUNDING.yml, see: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository
     ```
5. **Idempotency**: Only create one PR per issue. Track processed issues to avoid duplicates:
   - Add both a label (`funding-yml-processed`) AND a comment marker (`<!-- funding-yml-pr: <pr_url> -->`)
   - Check for either the label or comment marker before processing
   - This provides redundancy and makes tracking visible

## Key constraints and patterns
- **Only process issues with label**: `funding-yml-requested` and status `open`
- **Performance**: Check `.github/FUNDING.yml` via API first (most common location), fall back to root only if 404
- **Idempotency tracking**: Use BOTH a label (`funding-yml-processed`) AND a hidden comment (`<!-- funding-yml-pr: <pr_url> -->`) after creating PR. Check for either before processing.
- **Error handling**: If ANY errors occur (malformed fields, missing data, target repo doesn't exist, PR creation fails, etc.), open an issue in THIS repo (`oss-wishlist/manage-funding-yml`) with details for investigation

## Implementation guidance for AI agents

### File structure
- `action.yml` — Action metadata with inputs (issue_number, repo_token) and outputs (pr_url, status)
- `src/index.js` or `entrypoint.sh` — Main logic (Node.js preferred for GitHub API, Octokit available)
- `.github/workflows/wishlist-issue-handler.yml` — Workflow triggered by issues in `oss-wishlist/wishlists`
- `README.md` — Usage docs, installation steps, example workflow

### Implementation strategy
1. **Parse issue body**: Issues follow a consistent template format. Extract structured fields using this logic:
   - First, fetch all comments on the issue
   - Look for comments starting with "📝 Wishlist Updated" followed by "The wishlist has been updated with the following information:"
   - **Note**: Issues may have other comments (discussions, notes, etc.) - filter to only wishlist update comments by checking for the prefix
   - **If wish update comments exist**: Use the LAST (most recent) one and extract fields from it
   - **If NO wish update comments exist**: Extract fields from the issue body itself
   - Match `### Maintainer GitHub Username` followed by username on next line
   - Match `### Project Repository` followed by URL on next line
   - Use the current issue URL as the wishlist link
2. **GitHub API calls**:
   - `GET /repos/{owner}/{repo}/issues/{issue_number}/comments` (fetch all comments to find latest "📝 Wishlist Updated")
   - `GET /repos/{owner}/{repo}/contents/.github/FUNDING.yml` (check primary location)
   - `GET /repos/{owner}/{repo}/contents/FUNDING.yml` (fallback if 404)
   - `POST /repos/{owner}/{repo}/pulls` (create PR)
   - `POST /repos/{owner}/{repo}/issues/{issue_number}/comments` (add tracking comment)
   - `POST /repos/{owner}/{repo}/issues/{issue_number}/labels` (add `funding-yml-processed` label)
   - `POST /repos/oss-wishlist/manage-funding-yml/issues` (report errors)
3. **FUNDING.yml parsing**: If file exists, parse YAML and append to `custom` array if not already present
4. **Idempotency tracking**: After PR creation:
   - Comment on issue with `<!-- funding-yml-pr: <pr_url> -->` marker
   - Add label `funding-yml-processed` to the issue
   - Check for either marker before processing any issue

### Code patterns
- Use `@actions/core`, `@actions/github`, and `@octokit/rest` for Node.js implementation
- Use environment variables: `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_EVENT_PATH`
- Error handling: Wrap all operations in try-catch. On any error, create an issue in `oss-wishlist/manage-funding-yml` with title `Error processing wishlist issue #<number>` and body containing error details, stack trace, and link to original issue
- Example FUNDING.yml format:
  ```yaml
  custom: ['https://github.com/oss-wishlist/wishlists/issues/123']
  ```
- If `custom` already exists with other URLs, merge: `custom: ['existing-url', 'https://...']`

### Testing and debugging
- Test with `act` locally: `act issues -e .github/workflows/test-event.json`
- Create sample issue event JSON with `funding-yml-requested` label
- Mock API responses for faster iteration
- Add `console.log` / `core.info` statements for debugging issue parsing

### References
- GitHub issue body parsing: Look for "📝 Wishlist Updated" comment, then extract fields after `### Maintainer GitHub Username` and `### Project Repository`
- If no update comments exist, parse issue body directly for the same fields
- FUNDING.yml spec: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository
- Octokit REST API: https://octokit.github.io/rest.js/
