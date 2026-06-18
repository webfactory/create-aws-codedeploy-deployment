'use strict';

(async function () {
    const core = await import('@actions/core');
    const { context } = await import('@actions/github');
    const action = require('./action');

    const payload = context.payload;

    const applicationName = core.getInput('application') || payload.repository.name; // like "Hello-World"

    const isPullRequest = payload.pull_request !== undefined;
    const commitId = isPullRequest ? payload.pull_request.head.sha : (payload.head_commit ? payload.head_commit.id : context.sha); // like "ec26c3e57ca3a959ca5aad62de7213c562f8c821"
    const branchName = isPullRequest ? payload.pull_request.head.ref : payload.ref.replace(/^refs\/heads\//, ''); // like "my/branch_name"
    const pullRequestNumber = isPullRequest ? payload.pull_request.number : undefined;
    const configLookupName = core.getInput('config-name') || branchName;

    try {
        await action.deleteDeploymentGroup(applicationName, branchName, pullRequestNumber, configLookupName, core);
    } catch (e) {
        console.log(`👉🏻 ${e.message}`);
        process.exit(1);
    }
})();
