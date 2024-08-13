# create-aws-codedeploy-deployment Action Changelog

## Version v0.5.1

- Update action code to use the AWS JavaScript SDK v3, to make warnings about the upcoming v2 EOL go away

## Version v0.5.0

- Added a second action to remove deployment groups, e. g. after a PR has been closed or merged. In order to serve both actions from a single repository, the actions were moved to subdirectories. Refer to actions as `webfactory/create-aws-codedeploy-deployment/create-deployment@v0.5.0` and `webfactory/create-aws-codedeploy-deployment/delete-deployment-group@v0.5.0` respectively in your workflow's `uses:` clause.

## Previous versions

No dedicated changelog file has been written. Refer to https://github.com/webfactory/create-aws-codedeploy-deployment/releases for release information.
