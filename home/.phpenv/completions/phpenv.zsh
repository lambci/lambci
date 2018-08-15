if [[ ! -o interactive ]]; then
    return
fi

compctl -K _phpenv phpenv

_phpenv() {
  local words completions
  read -cA words

  if [ "${#words}" -eq 2 ]; then
    completions="$(phpenv commands)"
  else
    completions="$(phpenv completions ${words[2,-1]})"
  fi

  reply=("${(ps:\n:)completions}")
}
