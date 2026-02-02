fish_add_path /opt/homebrew/bin
fish_add_path /opt/homebrew/sbin
fish_add_path $HOME/.local/bin
fish_add_path $HOME/.local/share/bob/nvim-bin

if type -q go
    fish_add_path (go env GOPATH)/bin
end
