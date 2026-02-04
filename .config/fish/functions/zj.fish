function zj --description "Launch zellij with theme matching system appearance"
  set -l appearance (defaults read -g AppleInterfaceStyle 2>/dev/null)
  if test "$appearance" = Dark
    zellij -l default-mocha options --theme "catppuccin-latte" $argv
  else
    zellij -l default-latte options --theme "catppuccin-latte" $argv
  end
end
