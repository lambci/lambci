module.exports = render

function render(params) {
  var build = params.build

  var buildClasses = 'fa-cog fa-spin pending'
  switch (build.status) {
    case 'success':
      buildClasses = 'fa-check success'
      break
    case 'failure':
      buildClasses = 'fa-times failure'
      break
  }

  return `
<html>
<head>
  <meta charset="utf-8">
  <title>Build #${build.buildNum} – ${build.repo} – LambCI</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.6.3/css/font-awesome.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css?family=Inconsolata" rel="stylesheet">
  <style>
    h1 { margin-top: 0.5em; font-weight: normal; font-size: 1.6em; }
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
      <h1 style="float: left; margin-right: 2em"><i class="fa fa-github"></i>${build.repo}</h1>
      <h1 style="float: left"><i class="fa fa-code-fork"></i>${build.branch}</h1>
      <h1 style="float: right"><i class="fa ${buildClasses}"></i>Build #${build.buildNum}</h1>
    </div>

    <table style="color: #636363; border: 1px solid #D3D3D3; padding: 5px; margin-bottom: 20px">
      <tr>
        <td><i class="fa fa-code-fork"></i>234af..234af</td>
        <td><i class="fa fa-user"></i>mhart</td>
        <td><i class="fa fa-calendar-o"></i>2016-01-12 12:34:56</td>
      </tr>
      <tr>
        <td>234af..234af</td>
        <td><i class="fa fa-clock-o"></i>1m26s</td>
        <td><i class="fa fa-clock-o"></i>1m26s</td>
      </tr>
    </table>

    <div style="background-color: #1A0000; color: #FFF; padding: 20px; margin: 0">
      <pre style="margin: 0">${params.log}</pre>
    </div>

  </div>
</body>
</html>

`
}
