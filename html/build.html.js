var utils = require('../utils')

module.exports = render

function render(params) {
  var build = params.build
  var logHtml = params.log

  var elapsedTxt = utils.elapsedTxt(build.startedAt, build.endedAt)

  var buildClasses = 'fa-cog fa-spin pending'
  switch (build.status) {
    case 'success':
      buildClasses = 'fa-check success'
      break
    case 'failure':
      buildClasses = 'fa-times failure'
      break
  }

  var branchLink = build.prNum ? `<a href="https://github.com/${build.repo}/pull/${build.prNum}">PR #${build.prNum}</a>` :
    `<a href="https://github.com/${build.repo}/tree/${build.branch}">${build.branch}</a>`

  var compareUrl = `https://github.com/${build.repo}/compare/${build.baseCommit}...${build.commit}`
  var compareTxt = `${build.baseCommit.slice(0, 7)}..${build.commit.slice(0, 7)}`
  var commentTxt = utils.htmlEncode(build.comment.split('\n')[0])
  var commentTitle = build.prNum ? 'Pull request title' : 'Head commit comment'

  var userTitle = build.prNum ? 'Pull request opener' : 'Branch pusher'

  // Could calculate gravatar imgs here from email
  var users = build.prNum ? [build.repo.split('/')[0]] : Object.keys(build.committers || {}).slice(0, 10).map(key => build.committers[key])
  var usersIcon = users.length > 1 ? 'fa-users' : 'fa-user'
  var usersStr = users.map(username => `<a href="https://github.com/${username}">${username}</a>`).join(', ')
  var usersTitle = build.prNum ? 'Base repo user/organization' : 'Committers and authors'

  return `
<html>
<head>
  <meta charset="utf-8">
  <title>Build #${build.buildNum} – ${build.repo} – LambCI</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.6.3/css/font-awesome.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css?family=Inconsolata" rel="stylesheet">
  <style>
    h1 { margin-top: 0.5em; font-weight: normal; font-size: 1.6em; }
    a { color: inherit; text-decoration: none }
    a:hover { text-decoration: underline }
    td { padding-right: 2em; }
    .clearfix:after { content: ""; display: table; clear: both; }
    .fa { vertical-align: text-top; margin-right: 0.4em; }
    .success { color: #44CC11; }
    .failure { color: #E05D44; }
    .pending { color: #DFB317; }
  </style>
</head>

<body style="margin: 0; padding: 10px; background: #FFF; font-family: 'Inconsolata', monospace">
  <div style="width: 100%; max-width: 60em; margin-left: auto; margin-right: auto; margin-top: 0; margin-bottom: 0">

    <div class="clearfix">
      <h1 style="float: left; margin-right: 2em"><i class="fa fa-github"></i><a href="https://github.com/${build.repo}">${build.repo}</a></h1>
      <h1 style="float: left"><i class="fa fa-code-fork"></i>${branchLink}</h1>
      <h1 style="float: right"><i class="fa ${buildClasses}"></i>Build #${build.buildNum}</h1>
    </div>

    <table style="color: #636363; border: 1px solid #D3D3D3; padding: 5px; margin-bottom: 20px">
      <tr>
        <td colspan="3" title="${commentTitle}" style="border-bottom: 1px solid #D3D3D3; padding-bottom: 5px">
          <i class="fa fa-comment-o"></i>${commentTxt}
        </td>
      </tr>
      <tr>
        <td title="Head commit" style="padding-top: 5px">
          <i class="fa fa-link"></i><a href="https://github.com/${build.repo}/commit/${build.commit}">${build.commit.slice(0, 7)}</a>
        </td>
        <td title="${userTitle}">
          <i class="fa fa-cloud-upload"></i><a href="https://github.com/${build.user}">${build.user}</a>
        </td>
        <td title="Build start date/time">
          <i class="fa fa-calendar-o"></i><span id="startedAt" title="${build.startedAt.toISOString()}">${build.startedAt.toISOString()}</span>
        </td>
      </tr>
      <tr>
        <td title="Commit comparison">
          <i class="fa fa-sliders"></i><a href="${compareUrl}">${compareTxt}</a>
        </td>
        <td title="${usersTitle}">
          <i class="fa ${usersIcon}"></i>${usersStr}
        </td>
        <td title="Elapsed build time">
          <i class="fa fa-clock-o"></i>${elapsedTxt}
        </td>
      </tr>
    </table>

    <div style="float: right; color: #FFF; margin-top: 10px; margin-right: 10px">
      <i class="fa fa-lock"></i><a href="${build.lambdaLogUrl}">Lambda log</a>
    </div>
    <div style="float: right; color: #FFF; margin-top: 10px; margin-right: 20px">
      <i class="fa fa-lock"></i><a href="${build.buildDirUrl}">All builds</a>
    </div>

    <div style="background-color: #1A0000; color: #FFF; padding: 20px; margin: 0">
      <pre style="margin: 0; width: 100%; overflow: scroll">${logHtml}</pre>
    </div>

  </div>

  <script>
    var startedAt = document.getElementById('startedAt')
    startedAt.textContent = new Date(startedAt.title).toLocaleString()
  </script>
</body>
</html>

`
}
