# ~/.config/fish/conf.d/00-path.fish

# 1. Initialize Homebrew FIRST
# This ensures tools like 'go' installed via brew are visible for the checks below.
if test -x /opt/homebrew/bin/brew
    eval "$(/opt/homebrew/bin/brew shellenv)"
end

# 2. Add local binaries (only if the directories exist)
if test -d $HOME/.local/bin
    fish_add_path $HOME/.local/bin
end

# cargo
if test -d $HOME/.cargo/bin
    fish_add_path $HOME/.cargo/bin
end

# Neovim Version Manager (Bob)
if test -d $HOME/.local/share/bob/nvim-bin
    fish_add_path $HOME/.local/share/bob/nvim-bin
end

# 3. Go Configuration
# Since brew is initialized at the top, 'type -q go' will successfully find brew-installed Go.
if type -q go
    set -l go_path (go env GOPATH)/bin
    if test -d $go_path
        fish_add_path $go_path
    end
end
