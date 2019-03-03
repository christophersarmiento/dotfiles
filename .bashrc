# Prompt
PS1='\[\e[36m\w\] \[\e[35m\]\[\e[1m\]\n❯ \[\e[0m\]'

# Alias vim to nvim
alias vim="nvim"

# Color stuff
if [[ $COLORTERM = gnome-* && $TERM = xterm ]] && infocmp gnome-256color >/dev/null 2>&1; then
	export TERM='gnome-256color';
elif infocmp xterm-256color >/dev/null 2>&1; then
	export TERM='xterm-256color';
fi;

# colorls
alias ls='colorls --sd'
alias lsa='colorls -a'

