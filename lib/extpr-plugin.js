const statusTokenSvc = require('./update-status-token')

/**
 * The extpr plugin detects CiviCRM extensions. If the repository is suitably authorized,
 * it triggers a test job in Jenkins.
 */
module.exports = (robot) => {
  const getFileContent = require('./get-content')

  if (!process.env.STATUS_SECRET) {
    throw new Error('Failed to read required environment variable: STATUS_SECRET')
  }

  /**
   * When the PR is opened or updated, mark the commit as pending and notify Jenkins.
   */
  robot.on('pull_request.opened', async context => {
    const infoxml = await getFileContent(context, 'info.xml')
    if (infoxml === null || infoxml === '') {
      return
    }

    const blds = [
      // {name: 'CiviCRM @ RC', jobData: {'CIVI_VER': '5.4'}},
      // {name: 'CiviCRM @ Stable', jobData: {'CIVI_VER': '5.3'}},
      {name: 'CiviCRM @ Master', job: 'Extension-SHA', jobData: {'CIVI_VER': 'master'}}
    ]

    for (var bldNum in blds) {
      const bld = blds[bldNum]
      const repo = context.repo()
      const statusTemplate = {
        ...repo,
        sha: context.payload.pull_request.head.sha,
        context: bld.name
      }

      await context.github.repos.createStatus({
        ...statusTemplate,
        state: 'pending',
        target_url: '',
        description: 'Waiting for tests to start'
      })

      try {
        var jobData = {
          ...bld.jobData,
          'GIT_URL': context.payload.repository.git_url,
          'GIT_COMMIT': context.payload.pull_request.head.sha,
          'STATUS_TOKEN': createStatusToken(context, statusTemplate)
        }
        await robot.jenkins.build_with_params(bld.job, jobData)
      } catch (err) {
        await context.github.repos.createStatus({
          ...statusTemplate,
          state: 'error',
          target_url: '',
          description: 'Failed to initiate test job. Please consult infrastructure support channel.'
        })
      }
    }
  })

  /**
   * Create a callback token that can be used to update the status
   * of a particular check/job.
   *
   * @param Object context
   *   The webhook context of the pull-request which we're testing.
   * @param Object tpl
   *   Template/mandatory parameters for a call github.repos.createStatus().
   * @returns {*}
   *   Signed token
   */
  function createStatusToken (context, tpl) {
    return statusTokenSvc.sign({
      eventId: context.id,
      instlId: context.payload.installation.id,
      tpl: tpl
    })
  }
}