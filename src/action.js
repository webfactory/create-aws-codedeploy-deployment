'use strict';

const {
    CodeDeploy: client,
    waitUntilDeploymentSuccessful,
} = require('@aws-sdk/client-codedeploy');

function fetchBranchConfig(configLookupName, core) {
    const fs = require('fs');
    const yaml = require('js-yaml');

    try {
        var fileContents = fs.readFileSync('./appspec.yml', 'utf8');
    } catch (e) {
        if (e.code == 'ENOENT') {
            core.setFailed('🙄 appspec.yml file not found. Hint: Did you run actions/checkout?');
            process.exit();
        } else {
            throw e;
        }
    }
    let data = yaml.load(fileContents);

    for (var prop in data.branch_config) {
        var regex = new RegExp('^' + prop + '$', 'i');
        if (configLookupName.match(regex)) {
            if (data.branch_config[prop] == null) {
                console.log(`🤷🏻‍♂️ Found an empty appspec.yml -> branch_config for '${configLookupName}' – skipping deployment`);
                process.exit();
            }
            console.log(`💡 Using appspec.yml -> branch_config '${prop}' for '${configLookupName}'`);
            return data.branch_config[prop];
        }
    }

    console.log(`❓ Found no matching appspec.yml -> branch_config for '${configLookupName}' – skipping deployment`);
    process.exit();
}

exports.deleteDeploymentGroup = async function (applicationName, branchName, pullRequestNumber, configLookupName, core) {
    const branchConfig = fetchBranchConfig(configLookupName, core);
    const safeBranchName = branchName.replace(/[^a-z0-9-/]+/gi, '-').replace(/\/+/, '--');
    const deploymentGroupName = (branchConfig.deploymentGroupName ?? safeBranchName).replace('$BRANCH', safeBranchName).replace('$PR_NUMBER', pullRequestNumber);

    console.log(`🎳 Using deployment group '${deploymentGroupName}'`);

    const codeDeploy = new client();

    try {
        core.setOutput('deploymentGroupName', deploymentGroupName);

        await codeDeploy.deleteDeploymentGroup({
            applicationName: applicationName,
            deploymentGroupName: deploymentGroupName
        });

        console.log(`🗑️ Deleted deployment group '${deploymentGroupName}'`);
    } catch (e) {
        if (e.name == 'DeploymentGroupDoesNotExistException') {
            console.log(`🤨 Deployment group '${deploymentGroupName}' does not exist`);
        } else {
            core.setFailed(`🌩 Unhandled exception`);
            throw e;
        }
    }
}

exports.createDeployment = async function(applicationName, fullRepositoryName, branchName, pullRequestNumber, configLookupName, commitId, runNumber, skipSequenceCheck, core) {
    const branchConfig = fetchBranchConfig(configLookupName, core);
    const safeBranchName = branchName.replace(/[^a-z0-9-/]+/gi, '-').replace(/\/+/, '--');
    const deploymentGroupName = (branchConfig.deploymentGroupName ?? safeBranchName).replace('$BRANCH', safeBranchName).replace('$PR_NUMBER', pullRequestNumber);
    const deploymentGroupConfig = branchConfig.deploymentGroupConfig;
    const deploymentConfig = branchConfig.deploymentConfig;

    console.log(`🎳 Using deployment group '${deploymentGroupName}'`);

    const codeDeploy = new client();

    try {
        await codeDeploy.updateDeploymentGroup({
            ...deploymentGroupConfig,
            ...{
                applicationName: applicationName,
                currentDeploymentGroupName: deploymentGroupName
            }
        });
        console.log(`⚙️  Updated deployment group '${deploymentGroupName}'`);

        core.setOutput('deploymentGroupCreated', 0);
    } catch (e) {
        if (e.name == 'DeploymentGroupDoesNotExistException') {
            await codeDeploy.createDeploymentGroup({
                ...deploymentGroupConfig,
                ...{
                    applicationName: applicationName,
                    deploymentGroupName: deploymentGroupName,
                }
            });
            console.log(`🎯 Created deployment group '${deploymentGroupName}'`);

            core.setOutput('deploymentGroupCreated', 1);
        } else {
            core.setFailed(`🌩  Unhandled exception`);
            throw e;
        }
    }

    let tries = 0;
    const description = runNumber ? `Created by webfactory/create-aws-codedeploy-deployment (run_number=${runNumber})` : '';

    while (true) {

        if (++tries > 5) {
            core.setFailed('🤥 Unable to create a new deployment (too much concurrency?)');
            return;
        }

        if (!skipSequenceCheck && runNumber) {
            var {deploymentGroupInfo: {lastAttemptedDeployment: {deploymentId: lastAttemptedDeploymentId} = {}}} = await codeDeploy.getDeploymentGroup({
                applicationName: applicationName,
                deploymentGroupName: deploymentGroupName,
            });

            if (lastAttemptedDeploymentId) {
                var {deploymentInfo: {description: lastAttemptedDeploymentDescription}} = await codeDeploy.getDeployment({
                    deploymentId: lastAttemptedDeploymentId,
                });

                var matches, lastAttemptedDeploymentRunNumber;

                if (lastAttemptedDeploymentDescription && (matches = lastAttemptedDeploymentDescription.match(/run_number=(\d+)/))) {
                    lastAttemptedDeploymentRunNumber = matches[1];
                    if (parseInt(lastAttemptedDeploymentRunNumber) > parseInt(runNumber)) {
                        core.setFailed(`🙅‍♂️ The last attempted deployment as returned by the AWS API has been created by a higher run number ${lastAttemptedDeploymentRunNumber}, this is run number ${runNumber}. Aborting.`);
                        return;
                    } else {
                        console.log(`🔎 Last attempted deployment was from run number ${lastAttemptedDeploymentRunNumber}, this is run number ${runNumber} - proceeding.`);
                    }
                }
            }

            /*
                There's a slight remaining chance that the above check does not suffice: If we just
                passed the check, but another (newer) build creates AND finishes a deployment
                BEFORE we reach the next lines, an out-of-order deployment might happen. This is a
                race condition that requires an extension on the AWS API side in order to be resolved,
                see https://github.com/aws/aws-codedeploy-agent/issues/248.
             */
        }

        try {
            var {deploymentId: deploymentId} = await codeDeploy.createDeployment({
                ...deploymentConfig,
                ...{
                    applicationName: applicationName,
                    deploymentGroupName: deploymentGroupName,
                    description: description,
                    revision: {
                        revisionType: 'GitHub',
                        gitHubLocation: {
                            commitId: commitId,
                            repository: fullRepositoryName
                        }
                    }
                }
            });
            console.log(`🚚️ Created deployment ${deploymentId} – https://console.aws.amazon.com/codesuite/codedeploy/deployments/${deploymentId}?region=${codeDeploy.config.region}`);
            core.setOutput('deploymentId', deploymentId);
            core.setOutput('deploymentGroupName', deploymentGroupName);
            break;
        } catch (e) {
            if (e.name == 'DeploymentLimitExceededException') {
                let message = e.message.toString();
                let found = message.match(/(?:is already deploying|already has an active Deployment) \'(d-\w+)\'/);

                if (!found) {
                    console.log(`🐞 Unexpected exception message: ${message}`);
                    core.setFailed('Aborting');
                    throw e;
                }

                let [, otherDeployment] = found;
                console.log(`😶 Waiting for another pending deployment ${otherDeployment}`);
                try {
                    await waitUntilDeploymentSuccessful({
                        client: codeDeploy,
                        maxWaitTime: 10,
                    }, {deploymentId: otherDeployment});
                    console.log(`🙂 The pending deployment ${otherDeployment} sucessfully finished.`);
                } catch (e) {
                    console.log(`🤔 The other pending deployment ${otherDeployment} seems to have failed.`);
                }
                continue;
            } else {
                core.setFailed(`🌩  Unhandled exception`);
                throw e;
            }
        }
    }

    console.log(`⏲  Waiting for deployment ${deploymentId} to finish`);

    try {
        await waitUntilDeploymentSuccessful({
            client: codeDeploy,
            maxWaitTime: 10,
        }, {deploymentId: deploymentId});
        console.log('🥳 Deployment successful');
    } catch (e) {
        core.setFailed(`😱 The deployment ${deploymentId} seems to have failed.`);
    }
}
