'use strict';

(async function () {
    var core = require('@actions/core');
    core.setOutput = function () {};
    core.setFailed = function (message) {
        console.log(message instanceof Error ? message.toString() : message);
        process.exitCode = 1;
    }

    const fs = require('fs');
    if (!fs.existsSync('./appspec.yml')) {
        core.setFailed("❓ ./appspec.yml does not exist. Make sure you are in the project's top level directory.");
        process.exit();
    }

    const simpleGit = require('simple-git');
    const git = simpleGit();
    var branchName, commitId;

    try {
        await git.init();
        const remotes = await git.getRemotes(true);
        var applicationName, fullRepositoryName;

        for (const remote of remotes) {
            if (remote.name !== 'origin') {
                continue;
            }

            const url = remote.refs.push;

            var matches

            if (matches = url.match(/git@github.com:([a-z0-9_-]+)\/([a-z0-9_-]+).git/)) {
                applicationName = matches[2];
                fullRepositoryName = `${matches[1]}/${matches[2]}`;
            }
        }

        branchName = await git.revparse(['--abbrev-ref', 'HEAD']);
        commitId = await git.revparse(['HEAD']);
    } catch (e) {
        core.setFailed('🌩  Failed to parse git information. Are you sure this is a git repo?')
        process.exit();
    }

    if (!applicationName || !fullRepositoryName) {
        core.setFailed("❓ Unable to parse GitHub repository name from the 'origin' remote.");
        process.exit();
    }

    console.log("🚂 OK, let's ship this...");
    console.log(`GitHub 💎 repository '${fullRepositoryName}'`);
    console.log(`Branch 🎋 ${branchName}`);
    console.log(`Commit ⚙️  ${commitId}`);

    const prompt = require('prompt');

    prompt.message = '';
    prompt.start();

    try {
        /* const { applicationName, fullRepositoryName } = */ await prompt.get({
            properties: {
/*                applicationName: {
                    description: "CodeDeploy application name",
                    pattern: /^[a-z0-9\._+=,@\-]{1,100}$/,
                    message: 'Invalid CodeDeploy application name.',
                    required: true,
                    default: applicationName,
                },
                fullRepositoryName: {
                    description: 'Full repository name, like "octocat/example"',
                    pattern: /^[a-z0-9-]+\/[a-z0-9-]+$/,
                    message: 'Invalid repository name.',
                    required: true,
                    default: fullRepositoryName,
                }, */
                confirm: {
                    name: 'yes',
                    message: 'Type "yes" to create deployment',
                    validator: /yes/,
                    warning: 'Must respond yes to continue',
                    default: ''
                }
            }
        });
    } catch (e) {
        core.setFailed('🙈  Aborted.');
        process.exit();
    }

    const action = require('./create-deployment');
    try {
        await action.createDeployment(applicationName, fullRepositoryName, branchName, commitId, core);
    } catch (e) {
        console.log(`👉🏻 ${e.message}`);
        process.exit(1);
    }
})();
