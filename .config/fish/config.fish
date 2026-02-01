# Aliases
alias vim="nvim"
alias zj="zellij"
alias cd="z"
alias ls="eza --icons=always -G"
alias ll="eza --icons=always -l -a -h --smart-group --git --git-repos-no-status"
alias convert="python /Users/christopher/code/scripts/convert.py /Users/christopher/Music/Downloads/flacs"
alias cat="bat"

# Source machine specific variables
source ~/.config/fish/.profile.fish

# Fuzzy finder
fzf --fish | source

# Zoxide
zoxide init fish | source

# starship.rs prompt
theme
starship init fish | source
