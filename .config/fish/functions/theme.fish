function theme
    if test "$(defaults read -g AppleInterfaceStyle 2>/dev/null)" = "Dark"
        set -gx STARSHIP_CONFIG ~/.config/starship-dark.toml
    else
        set -gx STARSHIP_CONFIG ~/.config/starship-light.toml
    end
end
