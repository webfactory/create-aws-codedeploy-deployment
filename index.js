'use strict';

(async function () {
    const core = require('@actions/core');
    const github = require('@actions/github');
    const payload = github.context.payload;
    const action = require('./create-deployment');

    const applicationName = core.getInput('application') || payload.repository.name; // like "Hello-World"
    const fullRepositoryName = payload.repository.full_name; // like "Codertocat/Hello-World"

    const isPullRequest = payload.pull_request !== undefined;
    const commitId = isPullRequest ? payload.pull_request.head.sha : payload.head_commit.id; // like "ec26c3e57ca3a959ca5aad62de7213c562f8c821"
    const branchName = isPullRequest ? payload.pull_request.head.ref : payload.ref.replace(/^refs\/heads\//, ''); // like "my/branch_name"
    console.log(`🎋 On branch '${branchName}', head commit ${commitId}`);

    try {
        action.createDeployment(applicationName, fullRepositoryName, branchName, commitId, core);
    } catch (e) {}
})();
