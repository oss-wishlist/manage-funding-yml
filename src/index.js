const core = require('@actions/core');
const github = require('@actions/github');
const yaml = require('js-yaml');

/**
 * Parse issue body or comments to extract wishlist information
 * @param {object} octokit - GitHub API client
 * @param {object} issue - The issue object
 * @returns {object} Parsed data with maintainer, repository, and wishlistUrl
 */
async function parseIssueData(octokit, issue) {
  let sourceText = issue.body;
  
  // Fetch all comments to check for updates
  const { data: comments } = await octokit.rest.issues.listComments({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: issue.number
  });
  
  // Filter for wishlist update comments (starting with "📝 Wishlist Updated")
  const wishlistUpdates = comments.filter(comment => 
    comment.body.startsWith('📝 Wishlist Updated')
  );
  
  // If there are wishlist updates, use the most recent one
  if (wishlistUpdates.length > 0) {
    sourceText = wishlistUpdates[wishlistUpdates.length - 1].body;
    core.info(`Found ${wishlistUpdates.length} wishlist update(s). Using the most recent one.`);
  } else {
    core.info('No wishlist updates found. Using issue body.');
  }
  
  // Extract maintainer username
  const maintainerMatch = sourceText.match(/###\s*Maintainer GitHub Username\s*\n\s*(.+)/i);
  const maintainer = maintainerMatch ? maintainerMatch[1].trim() : null;
  
  // Extract project repository
  const repoMatch = sourceText.match(/###\s*Project Repository\s*\n\s*(.+)/i);
  const repository = repoMatch ? repoMatch[1].trim() : null;
  
  // Remove markdown link formatting if present
  const repoUrl = repository ? repository.replace(/\[(.+)\]\((.+)\)/, '$2') : null;
  
  // Wishlist URL is the current issue
  const wishlistUrl = issue.html_url;
  
  if (!maintainer || !repoUrl) {
    throw new Error(`Failed to parse required fields. Maintainer: ${maintainer}, Repository: ${repoUrl}`);
  }
  
  return { maintainer, repository: repoUrl, wishlistUrl };
}

/**
 * Parse owner and repo from a GitHub URL
 * @param {string} repoUrl - GitHub repository URL
 * @returns {object} Owner and repo name
 */
function parseRepoUrl(repoUrl) {
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) {
    throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
  }
  return { owner: match[1], repo: match[2] };
}

/**
 * Check if FUNDING.yml exists in the target repository
 * @param {object} octokit - GitHub API client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {object} File info or null if not found
 */
async function checkFundingFile(octokit, owner, repo) {
  // Check .github/FUNDING.yml first (most common)
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: '.github/FUNDING.yml'
    });
    core.info('Found existing FUNDING.yml in .github/');
    return { path: '.github/FUNDING.yml', sha: data.sha, content: data.content };
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  
  // Check root FUNDING.yml as fallback
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: 'FUNDING.yml'
    });
    core.info('Found existing FUNDING.yml in root');
    return { path: 'FUNDING.yml', sha: data.sha, content: data.content };
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  
  core.info('No existing FUNDING.yml found');
  return null;
}

/**
 * Create or update FUNDING.yml content
 * @param {string|null} existingContent - Base64 encoded existing content or null
 * @param {string} wishlistUrl - Wishlist URL to add
 * @returns {string} New FUNDING.yml content
 */
function createFundingContent(existingContent, wishlistUrl) {
  if (!existingContent) {
    // Create new FUNDING.yml
    return `custom: ['${wishlistUrl}']\n`;
  }
  
  // Parse existing FUNDING.yml
  const decoded = Buffer.from(existingContent, 'base64').toString('utf-8');
  const fundingData = yaml.load(decoded) || {};
  
  // Add or append to custom array
  if (!fundingData.custom) {
    fundingData.custom = [];
  } else if (!Array.isArray(fundingData.custom)) {
    fundingData.custom = [fundingData.custom];
  }
  
  // Add wishlist URL if not already present
  if (!fundingData.custom.includes(wishlistUrl)) {
    fundingData.custom.push(wishlistUrl);
  }
  
  return yaml.dump(fundingData);
}

/**
 * Create a pull request to add/update FUNDING.yml
 * @param {object} octokit - GitHub API client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {object} data - Parsed issue data
 * @param {object|null} fundingFile - Existing FUNDING.yml info
 * @returns {string} PR URL
 */
async function createPullRequest(octokit, owner, repo, data, fundingFile) {
  const branchName = `add-wishlist-funding-${Date.now()}`;
  const filePath = fundingFile ? fundingFile.path : '.github/FUNDING.yml';
  
  // Get authenticated user info
  const { data: authenticatedUser } = await octokit.rest.users.getAuthenticated();
  const forkOwner = authenticatedUser.login;
  
  core.info(`Authenticated as: ${forkOwner}`);
  
  // Get default branch
  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;
  
  // Check if we already have a fork, if not create one
  let forkRepo;
  try {
    const { data: existingFork } = await octokit.rest.repos.get({
      owner: forkOwner,
      repo: repo
    });
    forkRepo = existingFork;
    core.info(`Found existing fork: ${forkOwner}/${repo}`);
  } catch (error) {
    if (error.status === 404) {
      // Create fork
      core.info(`Creating fork of ${owner}/${repo}...`);
      const { data: newFork } = await octokit.rest.repos.createFork({
        owner,
        repo
      });
      forkRepo = newFork;
      
      // Wait a bit for fork to be ready
      core.info('Waiting for fork to be ready...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      throw error;
    }
  }
  
  // Get the SHA of the default branch from the fork
  const { data: refData } = await octokit.rest.git.getRef({
    owner: forkOwner,
    repo: repo,
    ref: `heads/${defaultBranch}`
  });
  const baseSha = refData.object.sha;
  
  // Create new branch in fork
  await octokit.rest.git.createRef({
    owner: forkOwner,
    repo: repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha
  });
  
  core.info(`Created branch ${branchName} in fork`);
  
  // Create or update FUNDING.yml in fork
  const newContent = createFundingContent(
    fundingFile ? fundingFile.content : null,
    data.wishlistUrl
  );
  
  await octokit.rest.repos.createOrUpdateFileContents({
    owner: forkOwner,
    repo: repo,
    path: filePath,
    message: fundingFile ? 'Update FUNDING.yml with wishlist link' : 'Add FUNDING.yml with wishlist link',
    content: Buffer.from(newContent).toString('base64'),
    branch: branchName,
    sha: fundingFile ? fundingFile.sha : undefined
  });
  
  core.info(`Created/updated ${filePath} in fork`);
  
  // Create pull request from fork to upstream
  const prBody = `This PR was opened at the request of @${data.maintainer} to add a wishlist link to your repository's sponsor button.

This will display the wishlist link in the "Sponsor this project" section of your repository.

For more information about FUNDING.yml, see: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository`;
  
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: 'Add wishlist link to FUNDING.yml',
    head: `${forkOwner}:${branchName}`,
    base: defaultBranch,
    body: prBody
  });
  
  core.info(`Created PR: ${pr.html_url}`);
  return pr.html_url;
}

/**
 * Check if issue has already been processed
 * @param {object} octokit - GitHub API client
 * @param {number} issueNumber - Issue number
 * @returns {boolean} True if already processed
 */
async function isAlreadyProcessed(octokit, issueNumber) {
  const { data: issue } = await octokit.rest.issues.get({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: issueNumber
  });
  
  // Check for label
  if (issue.labels.some(label => label.name === 'funding-yml-processed')) {
    core.info('Issue already has funding-yml-processed label');
    return true;
  }
  
  // Check for comment marker
  const { data: comments } = await octokit.rest.issues.listComments({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: issueNumber
  });
  
  if (comments.some(comment => comment.body.includes('<!-- funding-yml-pr:'))) {
    core.info('Issue already has funding-yml-pr comment marker');
    return true;
  }
  
  return false;
}

/**
 * Mark issue as processed
 * @param {object} octokit - GitHub API client
 * @param {number} issueNumber - Issue number
 * @param {string} prUrl - Pull request URL
 */
async function markAsProcessed(octokit, issueNumber, prUrl) {
  // Add comment marker
  await octokit.rest.issues.createComment({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: issueNumber,
    body: `<!-- funding-yml-pr: ${prUrl} -->\n\n✅ Created PR to add FUNDING.yml: ${prUrl}`
  });
  
  // Add label
  await octokit.rest.issues.addLabels({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: issueNumber,
    labels: ['funding-yml-processed']
  });
  
  core.info('Marked issue as processed');
}

/**
 * Report error by creating an issue in this repo
 * @param {object} octokit - GitHub API client
 * @param {number} issueNumber - Original issue number
 * @param {Error} error - The error that occurred
 */
async function reportError(octokit, issueNumber, error) {
  const issueUrl = `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/issues/${issueNumber}`;
  
  const errorBody = `**Error processing wishlist issue**

**Original Issue:** ${issueUrl}

**Error Message:**
\`\`\`
${error.message}
\`\`\`

**Stack Trace:**
\`\`\`
${error.stack}
\`\`\`

**Context:**
- Issue Number: #${issueNumber}
- Repository: ${github.context.repo.owner}/${github.context.repo.repo}
- Timestamp: ${new Date().toISOString()}
`;
  
  await octokit.rest.issues.create({
    owner: 'oss-wishlist',
    repo: 'manage-funding-yml',
    title: `Error processing wishlist issue #${issueNumber}`,
    body: errorBody,
    labels: ['error', 'automated']
  });
  
  core.error(`Reported error to manage-funding-yml repo`);
}

/**
 * Main action logic
 */
async function run() {
  try {
    const token = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);
    
    const issue = github.context.payload.issue;
    
    if (!issue) {
      core.setFailed('No issue found in context');
      return;
    }
    
    core.info(`Processing issue #${issue.number}: ${issue.title}`);
    
    // Check if already processed
    if (await isAlreadyProcessed(octokit, issue.number)) {
      core.info('Issue already processed. Skipping.');
      core.setOutput('status', 'skipped');
      return;
    }
    
    // Parse issue data
    const data = await parseIssueData(octokit, issue);
    core.info(`Parsed data: Maintainer=${data.maintainer}, Repo=${data.repository}`);
    
    // Parse target repository
    const { owner, repo } = parseRepoUrl(data.repository);
    core.info(`Target repository: ${owner}/${repo}`);
    
    // Check for existing FUNDING.yml
    const fundingFile = await checkFundingFile(octokit, owner, repo);
    
    // Create pull request
    const prUrl = await createPullRequest(octokit, owner, repo, data, fundingFile);
    
    // Mark issue as processed
    await markAsProcessed(octokit, issue.number, prUrl);
    
    core.setOutput('pr-url', prUrl);
    core.setOutput('status', 'success');
    
    core.info('✅ Action completed successfully');
  } catch (error) {
    core.error(`Action failed: ${error.message}`);
    core.error(error.stack);
    
    // Report error to manage-funding-yml repo
    try {
      const token = core.getInput('github-token', { required: true });
      const octokit = github.getOctokit(token);
      const issue = github.context.payload.issue;
      
      if (issue) {
        await reportError(octokit, issue.number, error);
      }
    } catch (reportingError) {
      core.error(`Failed to report error: ${reportingError.message}`);
    }
    
    core.setFailed(error.message);
    core.setOutput('status', 'error');
  }
}

run();
