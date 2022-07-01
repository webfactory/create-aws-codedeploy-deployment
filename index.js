'use strict';

(async function () {
    const core = require('@actions/core');
    const github = require('@actions/github');
    const payload = github.context.payload;
    const action = require('./create-deployment');

    const applicationName = core.getInput('application') || payload.repository.name; // like "Hello-World"
    const fullRepositoryName = payload.repository.full_name; // like "Codertocat/Hello-World"

    const isPullRequest = payload.pull_request !== undefined;
    const commitId = isPullRequest ? payload.pull_request.head.sha : (payload.head_commit ? payload.head_commit.id : github.context.sha); // like "ec26c3e57ca3a959ca5aad62de7213c562f8c821"
    const branchName = isPullRequest ? payload.pull_request.head.ref : payload.ref.replace(/^refs\/heads\//, ''); // like "my/branch_name"
    const configLookupName = core.getInput('config-name') || branchName;

    const skipSequenceCheck = core.getBooleanInput('skip-sequence-check');

    console.log(`🎋 On branch '${branchName}', head commit ${commitId}`);

    const runNumber = process.env['github_run_number'] || process.env['GITHUB_RUN_NUMBER'];

    try {
        await action.createDeployment(applicationName, fullRepositoryName, branchName, configLookupName, commitId, runNumber, skipSequenceCheck, core);
    } catch (e) {
        console.log(`👉🏻 ${e.message}`);
        process.exit(1);
    }
})();
