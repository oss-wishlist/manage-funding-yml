const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    // Get inputs
    const token = core.getInput('github-token', { required: true });
    const wishlistsRepo = core.getInput('wishlists-repo') || 'oss-wishlist/wishlists';
    const label = core.getInput('label') || 'funding-yml-requested';

    // Initialize Octokit
    const octokit = github.getOctokit(token);
    
    // Parse wishlists repo
    const [owner, repo] = wishlistsRepo.split('/');
    
    core.info(`Fetching issues from ${wishlistsRepo} with label: ${label}`);
    
    // Fetch issues with the specified label
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: label,
      state: 'open'
    });
    
    core.info(`Found ${issues.length} issues with label: ${label}`);
    
    // Process each issue
    for (const issue of issues) {
      try {
        await processIssue(octokit, issue);
      } catch (error) {
        core.error(`Failed to process issue #${issue.number}: ${error.message}`);
        // Continue with other issues even if one fails
      }
    }
    
    core.info('Completed processing all issues');
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function processIssue(octokit, issue) {
  core.info(`Processing issue #${issue.number}: ${issue.title}`);
  
  // Extract repository from issue body
  const repoMatch = issue.body.match(/Repository:\s*(?:https?:\/\/github\.com\/)?([^\s\/]+\/[^\s\/\n]+)/i);
  
  if (!repoMatch) {
    core.warning(`Could not find repository in issue #${issue.number}`);
    return;
  }
  
  const targetRepo = repoMatch[1].trim();
  const [targetOwner, targetRepoName] = targetRepo.split('/');
  
  core.info(`Target repository: ${targetOwner}/${targetRepoName}`);
  
  // Check if FUNDING.yml exists
  let fundingContent = null;
  let fundingSha = null;
  const fundingPath = '.github/FUNDING.yml';
  
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: targetOwner,
      repo: targetRepoName,
      path: fundingPath
    });
    
    if (data.content) {
      fundingContent = Buffer.from(data.content, 'base64').toString('utf8');
      fundingSha = data.sha;
      core.info('Found existing FUNDING.yml');
    }
  } catch (error) {
    if (error.status === 404) {
      core.info('FUNDING.yml does not exist, will create new file');
    } else {
      throw error;
    }
  }
  
  // Prepare the new line to add
  const issueUrl = issue.html_url;
  const ossWishlistLine = `oss_wishlist: ${issueUrl}`;
  
  // Create or update FUNDING.yml content
  let newContent;
  if (fundingContent) {
    // Check if oss_wishlist already exists
    if (fundingContent.includes('oss_wishlist:')) {
      core.info('FUNDING.yml already contains oss_wishlist entry, skipping');
      return;
    }
    // Add new line to existing content
    newContent = fundingContent.trim() + '\n' + ossWishlistLine + '\n';
  } else {
    // Create new content
    newContent = ossWishlistLine + '\n';
  }
  
  // Get default branch
  const { data: repoData } = await octokit.rest.repos.get({
    owner: targetOwner,
    repo: targetRepoName
  });
  const defaultBranch = repoData.default_branch;
  
  // Create a new branch
  const branchName = `add-oss-wishlist-funding-${issue.number}`;
  
  try {
    // Get the ref for the default branch
    const { data: refData } = await octokit.rest.git.getRef({
      owner: targetOwner,
      repo: targetRepoName,
      ref: `heads/${defaultBranch}`
    });
    
    // Create new branch
    try {
      await octokit.rest.git.createRef({
        owner: targetOwner,
        repo: targetRepoName,
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha
      });
      core.info(`Created branch: ${branchName}`);
    } catch (error) {
      if (error.status === 422) {
        core.info('Branch already exists, will use existing branch');
      } else {
        throw error;
      }
    }
    
    // Create or update FUNDING.yml
    if (fundingSha) {
      // Update existing file
      await octokit.rest.repos.createOrUpdateFileContents({
        owner: targetOwner,
        repo: targetRepoName,
        path: fundingPath,
        message: `Add OSS Wishlist funding link (${issueUrl})`,
        content: Buffer.from(newContent).toString('base64'),
        branch: branchName,
        sha: fundingSha
      });
      core.info('Updated FUNDING.yml');
    } else {
      // Create new file
      await octokit.rest.repos.createOrUpdateFileContents({
        owner: targetOwner,
        repo: targetRepoName,
        path: fundingPath,
        message: `Add FUNDING.yml with OSS Wishlist link (${issueUrl})`,
        content: Buffer.from(newContent).toString('base64'),
        branch: branchName
      });
      core.info('Created FUNDING.yml');
    }
    
    // Create pull request
    const prTitle = fundingSha 
      ? `Add OSS Wishlist funding link`
      : `Add FUNDING.yml with OSS Wishlist link`;
    
    const prBody = `This PR adds the OSS Wishlist funding link to support your project.

Related issue: ${issueUrl}

This change adds the \`oss_wishlist\` field to your FUNDING.yml file, which will display a link to the OSS Wishlist on your repository's funding page.`;
    
    try {
      const { data: pr } = await octokit.rest.pulls.create({
        owner: targetOwner,
        repo: targetRepoName,
        title: prTitle,
        head: branchName,
        base: defaultBranch,
        body: prBody
      });
      
      core.info(`Created PR #${pr.number}: ${pr.html_url}`);
      
      // Optionally comment on the original issue
      await octokit.rest.issues.createComment({
        owner: issue.repository.owner.login,
        repo: issue.repository.name,
        issue_number: issue.number,
        body: `✅ Pull request created: ${pr.html_url}`
      });
      
    } catch (error) {
      if (error.status === 422 && error.message.includes('pull request already exists')) {
        core.info('Pull request already exists for this branch');
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    core.error(`Failed to create PR for ${targetOwner}/${targetRepoName}: ${error.message}`);
    throw error;
  }
}

run();
