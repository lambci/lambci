function __fish_phpenv_needs_command
  set cmd (commandline -opc)
  if [ (count $cmd) -eq 1 -a $cmd[1] = 'phpenv' ]
    return 0
  end
  return 1
end

function __fish_phpenv_using_command
  set cmd (commandline -opc)
  if [ (count $cmd) -gt 1 ]
    if [ $argv[1] = $cmd[2] ]
      return 0
    end
  end
  return 1
end

complete -f -c phpenv -n '__fish_phpenv_needs_command' -a '(phpenv commands)'
for cmd in (phpenv commands)
  complete -f -c phpenv -n "__fish_phpenv_using_command $cmd" -a "(phpenv completions $cmd)"
end
