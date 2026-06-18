# create-aws-codedeploy-deployment Action Changelog

## Version v1.0.0

- Switch to Node.js v24 runtime
- Bump `@actions/core` to v3.x, `@actions/github` to v9.x, `@vercel/ncc` to v0.44, `js-yaml` to v4.2, `@aws-sdk/client-codedeploy` to latest
- Entry scripts renamed to `.cjs` to ensure CJS bundling with ncc when importing ESM-only packages via dynamic `import()`

## Version v0.5.1

- Update action code to use the AWS JavaScript SDK v3, to make warnings about the upcoming v2 EOL go away

## Version v0.5.0

- Added a second action to remove deployment groups, e. g. after a PR has been closed or merged. In order to serve both actions from a single repository, the actions were moved to subdirectories. Refer to actions as `webfactory/create-aws-codedeploy-deployment/create-deployment@v0.5.0` and `webfactory/create-aws-codedeploy-deployment/delete-deployment-group@v0.5.0` respectively in your workflow's `uses:` clause.

## Previous versions

No dedicated changelog file has been written. Refer to https://github.com/webfactory/create-aws-codedeploy-deployment/releases for release information.
