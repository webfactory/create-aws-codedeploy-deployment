![webfactory Logo](https://www.webfactory.de/bundles/webfactorytwiglayout/img/logo.png) 

# `create-aws-codedeploy-deployment`
### An Action to deploy GitHub repos with AWS CodeDeploy

This action creates [AWS CodeDeploy](https://aws.amazon.com/codedeploy/) deployments from your GitHub Actions workflow. Deployment Group and Deployment configuration itself are derived from an additional configuration section in `.appspec.yml`.

_Note:_ This README assumes you are familiar with the [basic AWS CodeDeploy concepts](https://docs.aws.amazon.com/codedeploy/latest/userguide/primary-components.html).
 
## Design Goals

While this Action tries to mostly get out of our way, it makes a few basic assumptions:

* For your GitHub repository, there is a corresponding CodeDeploy Application already set up.
* Git branches (and so, GitHub Pull Requests) will be mapped to CodeDeploy Deployment Groups. The action will create these, or update existing ones.
* Ultimately, a CodeDeploy Deployment is created with a [reference to the current commit in your GitHub repository](https://docs.aws.amazon.com/codedeploy/latest/userguide/integrations-partners-github.html).

The necessary configuration will be parsed from an additional `branch_config` key inside the `appspec.yml` file – which is the core config file for AWS CodeDeploy that you will need to keep in your repository anyway.

This makes it possible to create a matching configuration once, and then run deployments in different environments automatically. For example, updating a production system for commits or merges on `master`, and independent staging environments for every open Pull Request branch.

## Example Use Case

Please consider the following example Actions workflow that illustrates how this action can be used.

```yaml
# .github/workflows/deployment.yml

on:
    push:
        branches:
            - master
    pull_request:

jobs:
    deploy:
        runs-on: ubuntu-latest
        steps:
            -   uses: aws-actions/configure-aws-credentials@v4
                with:
                    aws-access-key-id: ${{ secrets.ACCESS_KEY_ID }}
                    aws-secret-access-key: ${{ secrets.SECRET_ACCESS_KEY }}
                    aws-region: eu-central-1
            -   uses: actions/checkout@v4
            -   id: deploy
                uses: webfactory/create-aws-codedeploy-deployment/create-deployment@v0.5.0
            -   uses: peter-evans/commit-comment@v2
                with:
                    token: ${{ secrets.GITHUB_TOKEN }}
                    body: |
                        @${{ github.actor }} this was deployed as [${{ steps.deploy.outputs.deploymentId }}](https://console.aws.amazon.com/codesuite/codedeploy/deployments/${{ steps.deploy.outputs.deploymentId }}?region=eu-central-1) to group `${{ steps.deploy.outputs.deploymentGroupName }}`.
```

First, this configures AWS Credentials in the GitHub Action runner. The [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) action is used for that, and credentials are kept in [GitHub Actions Secrets](https://help.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets).

Second, the current repository is checked out because we at least need to access the `appspec.yml` file.

Third, this action is run. It does not need any additional configuration in the workflow file, but we'll look at the `appspec.yml` file in a second.
   
Last, another action is used to show how output generated by this action can be used. In this example, it will leave a GitHub comment on the current commit, @notifying the commit author that a deployment was made, and point to the AWS Management Console where details for the deployment can be found.

Due to the first few lines in this example, the action will be run for commits pushed to the `master` branch and for Pull Requests
being opened or pushed to. With that in mind, let's look at the [`appspec.yml` configuration file](https://docs.aws.amazon.com/codedeploy/latest/userguide/reference-appspec-file.html).

```yaml
# .appspec.yml

# ... here be your existing CodeDeploy configuration.

# This section controls the action:
branch_config:
    wip\/.*: ~

    master:
        deploymentGroupName: production
        deploymentGroupConfig:
            serviceRoleArn: arn:aws:iam::1234567890:role/CodeDeployProductionRole
            ec2TagFilters:
                - { Type: KEY_AND_VALUE, Key: node_class, Value: production }
        deploymentConfig:
            autoRollbackConfiguration:
                enabled: true

    '.*':
        deploymentGroupName: $BRANCH.staging.acme.tld
        deploymentGroupConfig:
            serviceRoleArn: arn:aws:iam::1234567890:role/CodeDeployStagingRole
            ec2TagFilters:
                - { Type: KEY_AND_VALUE, Key: hostname, Value: phobos.stage }
```
  
The purpose of the `branch_config` section is to tell the action how to configure CodeDeploy Deployment Groups and Deployments, based on the
branch name the action is run on.

The subkeys are evaluated as regular expressions in the order listed, and the first matching one is used.

The first entry makes the action skip the deployment (do nothing at all) when the current branch is called something like `wip/add-feature-x`. You can use this, for example, if you have a convention for branches that are not ready for deployment yet, or if branches are created automatically by other tooling and you don't want to deploy them automatically.

Commits on the `master` branch are to be deployed in a Deployment Group called `production`. All other commits will create or update a Deployment Group named `$BRANCH.staging.acme.tld`, where `$BRANCH` will be replaced with a DNS-safe name derived from the current branch. Basically, a branch called `feat/123/new_gimmick` will use `feat-123-new-gimmick` for `$BRANCH`. Since the Deployment Group Name is available in the `$DEPLOYMENT_GROUP_NAME` environment variable inside your CodeDeploy Lifecycle Scripts, you can use that to create "staging" environments with a single, generic configuration statement.

Similar to `$BRANCH`, for workflows triggered by Pull Requests, the string `$PR_NUMBER` will be replaced by the pull request number.  

The `deploymentGroupConfig` and `deploymentConfig` keys in each of the two cases contain configuration that is passed as-is to the 
[`CreateDeploymentGroup`](https://docs.aws.amazon.com/codedeploy/latest/APIReference/API_CreateDeploymentGroup.html) or 
[`UpdateDeploymentGroup`](https://docs.aws.amazon.com/codedeploy/latest/APIReference/API_UpdateDeploymentGroup.html) API calls (for
`deploymentGroupConfig`), and to [`CreateDeployment`](https://docs.aws.amazon.com/codedeploy/latest/APIReference/API_CreateDeployment.html) for
`deploymentConfig`. That way, you should be able to configure about every CodeDeploy setting. Note that the `ec2TagFilters` will be used to control
to which EC2 instances (in the case of instance-based deployments) the deployment will be directed.

The only addition made will be that the `revision` parameter for `CreateDeployment` will be set to point to the current commit (the one the action is running for) in the current repository.

## Usage

0. The basic CodeDeploy setup, including the creation of Service Roles, IAM credentials with sufficient permissions and installation of the CodeDeploy Agent on your target hosts is outside the scope of this action. Follow [the documentation](https://docs.aws.amazon.com/codedeploy/latest/userguide/getting-started-codedeploy.html).
1. [Create a CodeDeploy Application](https://docs.aws.amazon.com/codedeploy/latest/userguide/applications-create.html) that corresponds to your repository. By default, this action will assume your application is named by the "short" repository name (so, `myapp` for a `myorg/myapp` GitHub repository), but you can also pass the application name as an input to the action.
2. Connect your CodeDeploy Application with your repository following [these instructions](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployments-create-cli-github.html).
3. Configure the [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) action in your workflow and provide the necessary IAM credentials as secrets. See the section below for the necessary IAM permissions.
4. Add the `branch_config` section to your `appspec.yml` file to map branches to Deployment Groups and their configuration. In the above example, the  `master` and `.*` sub-sections show the minimal configuration required.
5. Add `uses: webfactory/create-aws-codedeploy-deployment/create-deployment@v0.5.0` as a step to your workflow file. If you want to use the action's outputs, you will also need to provide an `id` for the step.

### AWS IAM Permissions

The IAM User that is used to run the action requires the following IAM permissions. Note that depending on your policies you might want to specify narrower Resource ARNs, that is, more specifically tailor the permission to one particular repository and/or application.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": [
                "iam:PassRole",
                "codedeploy:GetDeployment",
                "codedeploy:GetApplicationRevision",
                "codedeploy:CreateDeployment",
                "codedeploy:RegisterApplicationRevision",
                "codedeploy:GetDeploymentConfig",
                "codedeploy:GetDeploymentGroup",
                "codedeploy:UpdateDeploymentGroup",
                "codedeploy:CreateDeploymentGroup",
                "codedeploy:DeleteDeploymentGroup"
            ],
            "Resource": [
                "arn:aws:iam::{your_account_id}:role/{your_codedeploy_service_role}",
                "arn:aws:codedeploy:eu-central-1:{your_account_id}:deploymentconfig:*",
                "arn:aws:codedeploy:eu-central-1:{your_account_id}:deploymentgroup:*/*",
                "arn:aws:codedeploy:eu-central-1:{your_account_id}:application:*"
            ]
        }
    ]
}
```

## Race Conditions

As of writing, the AWS CodeDeploy API does not accept new deployment requests for an application and deployment group as long as another deployment is still in progress. So, this action will retry a few times and eventually (hopefully) succeed.

There might be situations where several workflow runs are triggered in quick succession - for example, when merging several approved pull requests in a short time. Since your test suites or workflow runs might take a varying amount of time to finish and to reach the deployment phase (_this_ action), you cannot be sure that the triggered deployments will happen in the order you merged the pull requests (to stick with the example). You could not even be sure that the last deployment made was based on the last commit in your repository.

To work around this, this action includes the GitHub Actions "[run id](https://docs.github.com/en/actions/reference/context-and-expression-syntax-for-github-actions#github-context)" in the `description` field for created deployments. Before creating a new deployment, it will fetch the _last attempted deployment_ from the AWS API and compare its run id with the current run. If the current run has a _lower_ id than the last attempted deployment, the deployment will be aborted.

This workaround should catch a good share of possible out-of-order deployments. There is a slight chance for mishaps, however: If a _newer_ deployment happens to start _after_ we checked the run id and finishes _before_ we commence our own deployment (just a few lines of code later), this might go unnoticed. To really prevent this from happening, ordering deployments probably needs to be supported on the AWS API side, see https://github.com/aws/aws-codedeploy-agent/issues/248.

## Action Input and Output Parameters

### Input

* `application`: The name of the CodeDeploy Application to work with. Defaults to the "short" repo name.
* `skip-sequence-check`: When set to `true`, do not attempt to make sure deployments happen in order. Use this when the workflow count has been reset or changed to a lower value; possible cause is renaming the workflow file.
* `config-name`: Name used to look up the deployment config in the `branch_config` section of the `appspec.yml` file. Defaults to the current branch name. By using this override, you can force a particular config to be used regardless of the branch name. Or, you can run the action several times within the same job to create multiple (different) deployments from the same branch.

### Outputs

* `deploymentId`: AWS CodeDeployment Deployment-ID of the deployment created
* `deploymentGroupName`: AWS CodeDeployment Deployment Group name used
* `deploymentGroupCreated`: `1`, if a new deployment group was created; `0` if an existing group was updated.

You can use the expression `if: steps.<your-deployment-step>.outputs.deploymentGroupCreated==true` (or `...==false`) on subsequent workflow steps to run actions only if the deployment created a new deployment group (or updated an existing deployment, respectively).

## Cleaning Up

Sooner or later you might want to get rid of the CodeDeploy Deployment Groups created by this action. For example, when you create deployments for pull requests opened in a repo, you might want to delete those once the PR has been closed or merged.

To help you with this, a second action is included in this repo that can delete Deployment Groups, and uses the same rules to derive the group name as described above.

Here is an example workflow that runs for closed pull requests:

```yaml
# .github/workflows/cleanup-deployment-groups.yml
on:
    pull_request:
        types:
            - closed

jobs:
    deployment:
        runs-on: ubuntu-latest
        steps:
            -   uses: aws-actions/configure-aws-credentials@v4
                with:
                    aws-access-key-id: ${{ secrets.ACCESS_KEY_ID }}
                    aws-secret-access-key: ${{ secrets.SECRET_ACCESS_KEY }}
                    aws-region: eu-central-1
            -   uses: actions/checkout@v4
            -   uses: webfactory/create-aws-codedeploy-deployment/delete-deployment-group@v0.5.0
```

## Hacking

As a note to my future self, in order to work on this repo:

* Clone it
* Run `yarn install` to fetch dependencies
* _hack hack hack_
* Run `npm run build` to update `dist/*`, which holds the files actually run
* Read https://help.github.com/en/articles/creating-a-javascript-action if unsure.
* Maybe update the README example when publishing a new version.

## Credits, Copyright and License

This action was written by webfactory GmbH, Bonn, Germany. We're a software development agency with a focus on PHP (mostly [Symfony](http://github.com/symfony/symfony)). We're big fans of automation, DevOps, CI and CD, and we're happily using the AWS platform for more than 10 years now.

If you're a developer looking for new challenges, we'd like to hear from you! Otherwise, if this Action is useful for you, add a ⭐️.

- <https://www.webfactory.de>
- <https://twitter.com/webfactory>

Copyright 2020 - 2024 webfactory GmbH, Bonn. Code released under [the MIT license](LICENSE).
