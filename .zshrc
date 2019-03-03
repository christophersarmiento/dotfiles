# Path to your oh-my-zsh installation.
export ZSH=/Users/chris/.oh-my-zsh

ZSH_THEME=""

# Default username to hide"user@hostname" info
DEFAULT_USER=""

# Uncomment the following line to enable command auto-correction.
#ENABLE_CORRECTION="true"

# Uncomment the following line to display red dots whilst waiting for completion.
COMPLETION_WAITING_DOTS="true"

plugins=(
  git
  tmux
  zsh-completions
  zsh-autosuggestions
  zsh-syntax-highlighting
)

#ZSH_TMUX_AUTOSTART='true'

source $ZSH/oh-my-zsh.sh


# Preferred editor for local and remote sessions
# if [[ -n $SSH_CONNECTION ]]; then
#   export EDITOR='vim'
# else
#   export EDITOR='mvim'
# fi

# Compilation flags
# export ARCHFLAGS="-arch x86_64"

# ssh
# export SSH_KEY_PATH="~/.ssh/rsa_id"

# random stuff you can probably delete
export PATH=$PATH:$HOME/miniconda3/bin
test -e "${HOME}/.iterm2_shell_integration.zsh" && source "${HOME}/.iterm2_shell_integration.zsh"
export PATH="/usr/local/opt/sqlite/bin:$PATH"

# pure prompt
autoload -U promptinit; promptinit
prompt pure
autoload -U compinit && compinit

# bat syntax theme
export BAT_THEME="OneHalfDark"

# colorls
alias ls='colorls --sd'
alias lsa='colorls -a'
bindkey -v
export PATH="/usr/local/sbin:$PATH"

# alias nvim to vim
if type nvim > /dev/null 2>&1; then
  alias vim='nvim'
fi

# dotfile management
alias config='/usr/bin/git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
config config status.showUntrackedFiles no

export PATH="$HOME/.pyenv/bin:$PATH"
eval "$(pyenv init -)"
eval "$(pyenv virtualenv-init -)"
