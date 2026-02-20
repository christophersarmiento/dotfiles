# Aliases
alias vim="nvim"
alias cd="z"
alias ls="eza --icons=always -G"
alias ll="eza --icons=always -l -a -h --smart-group --git --git-repos-no-status"
alias convert-flac="uv run /Users/christopher/code/scripts/convert.py /Users/christopher/Music/Downloads/flacs"
alias cat="bat"

# Source machine specific variables
if test -f ~/.config/fish/.profile.fish
    source ~/.config/fish/.profile.fish
end

set -gx HELIX_RUNTIME ~code/helix/src/helix/runtime

# Fuzzy finder
fzf --fish | source

# Zoxide
zoxide init fish | source

# starship.rs prompt
theme
starship init fish | source
