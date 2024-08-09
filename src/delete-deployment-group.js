'use strict';

(async function () {
    const core = require('@actions/core');
    const github = require('@actions/github');
    const payload = github.context.payload;
    const action = require('./action');

    const applicationName = core.getInput('application') || payload.repository.name; // like "Hello-World"

    const isPullRequest = payload.pull_request !== undefined;
    const commitId = isPullRequest ? payload.pull_request.head.sha : (payload.head_commit ? payload.head_commit.id : github.context.sha); // like "ec26c3e57ca3a959ca5aad62de7213c562f8c821"
    const branchName = isPullRequest ? payload.pull_request.head.ref : payload.ref.replace(/^refs\/heads\//, ''); // like "my/branch_name"
    const pullRequestNumber = isPullRequest ? payload.pull_request.number : undefined;
    const configLookupName = core.getInput('config-name') || branchName;

    console.log(`applicationName ${applicationName}, isPullRequest ${isPullRequest}, commitId ${commitId}, branchName ${branchName}, pullRequestNumber ${pullRequestNumber}, configLookupName ${configLookupName}`);

    try {
        await action.deleteDeploymentGroup(applicationName, branchName, pullRequestNumber, configLookupName, core);
    } catch (e) {
        console.log(`👉🏻 ${e.message}`);
        process.exit(1);
    }
})();
