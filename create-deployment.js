'use strict';

function fetchBranchConfig(branchName) {
    const fs = require('fs');
    const yaml = require('js-yaml');

    let fileContents = fs.readFileSync('./appspec.yml', 'utf8');
    let data = yaml.safeLoad(fileContents);

    for (var prop in data.branch_config) {
        var regex = new RegExp('^' + prop + '$', 'i');
        if (branchName.match(regex)) {
            if (data.branch_config[prop] == null) {
                console.log(`🤷🏻‍♂️ Found an empty appspec.yml -> branch_config for '${branchName}' – skipping deployment`);
                process.exit();
            }
            console.log(`💡 Using appspec.yml -> branch_config '${prop}' for branch '${branchName}'`);
            return data.branch_config[prop];
        }
    }

    console.log(`❓ Found no matching appspec.yml -> branch_config for '${branchName}' – skipping deployment`);
    process.exit();
}

exports.createDeployment = async function(applicationName, fullRepositoryName, branchName, commitId, runNumber, core) {
    const branchConfig = fetchBranchConfig(branchName);
    const safeBranchName = branchName.replace(/[^a-z0-9-/]+/gi, '-').replace(/\/+/, '--');
    const deploymentGroupName = branchConfig.deploymentGroupName ? branchConfig.deploymentGroupName.replace('$BRANCH', safeBranchName) : safeBranchName;
    const deploymentGroupConfig = branchConfig.deploymentGroupConfig;
    const deploymentConfig = branchConfig.deploymentConfig;

    console.log(`🎳 Using deployment group '${deploymentGroupName}'`);

    const client = require('aws-sdk/clients/codedeploy');
    const codeDeploy = new client();

    try {
        await codeDeploy.updateDeploymentGroup({
            ...deploymentGroupConfig,
            ...{
                applicationName: applicationName,
                currentDeploymentGroupName: deploymentGroupName
            }
        }).promise();
        console.log(`⚙️  Updated deployment group '${deploymentGroupName}'`);

        core.setOutput('deploymentGroupCreated', 0);
    } catch (e) {
        if (e.code == 'DeploymentGroupDoesNotExistException') {
            await codeDeploy.createDeploymentGroup({
                ...deploymentGroupConfig,
                ...{
                    applicationName: applicationName,
                    deploymentGroupName: deploymentGroupName,
                }
            }).promise();
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

        if (runNumber) {
            var {deploymentGroupInfo: {lastAttemptedDeployment: {deploymentId: lastAttemptedDeploymentId} = {}}} = await codeDeploy.getDeploymentGroup({
                applicationName: applicationName,
                deploymentGroupName: deploymentGroupName,
            }).promise();

            if (lastAttemptedDeploymentId) {
                var {deploymentInfo: {description: lastAttemptedDeploymentDescription}} = await codeDeploy.getDeployment({
                    deploymentId: lastAttemptedDeploymentId,
                }).promise();

                var matches, lastAttemptedDeploymentRunNumber;

                if (matches = lastAttemptedDeploymentDescription.match(/run_number=(\d+)/)) {
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
            }).promise();
            console.log(`🚚️ Created deployment ${deploymentId} – https://console.aws.amazon.com/codesuite/codedeploy/deployments/${deploymentId}?region=${codeDeploy.config.region}`);
            core.setOutput('deploymentId', deploymentId);
            core.setOutput('deploymentGroupName', deploymentGroupName);
            break;
        } catch (e) {
            if (e.code == 'DeploymentLimitExceededException') {
                var [, otherDeployment] = e.message.toString().match(/is already deploying deployment \'(d-\w+)\'/);
                console.log(`😶 Waiting for another pending deployment ${otherDeployment}`);
                try {
                    await codeDeploy.waitFor('deploymentSuccessful', {deploymentId: otherDeployment}).promise();
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
        await codeDeploy.waitFor('deploymentSuccessful', {deploymentId: deploymentId}).promise();
        console.log('🥳 Deployment successful');
    } catch (e) {
        core.setFailed(`😱 The deployment ${deploymentId} seems to have failed.`);
        throw e;
    }
}
