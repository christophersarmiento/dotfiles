function gcm --description "Generate a commit message with Claude"
  set -l diff (git diff --cached)
  if test -z "$diff"
    echo "No staged changes. Stage files first with git add."
    return 1
  end

  fish -c '
    set -l frames · ✢ ✳ ✶ ✻ ✽ ✻ ✶ ✳ ✢
    set -l verbs Thinking Pondering Musing Noodling Cooking Brewing Crafting Conjuring Mulling Hatching
    set -l verb $verbs[(random 1 (count $verbs))]
    set -l label "  $verb…"
    set -l dim D97757
    set -l bright F0B090
    set -l frame_idx 1
    set -l pulse 1
    set -l len (math 1 + (string length "$label"))

    printf "\e[?25l"
    while true
      set -l glyph $frames[$frame_idx]
      set -l full "$glyph$label"

      printf "\r"
      for i in (seq 1 $len)
        set -l ch (string sub -s $i -l 1 "$full")
        if test $i -eq $pulse
          printf "%s%s" (set_color $bright) "$ch"
        else
          printf "%s%s" (set_color $dim) "$ch"
        end
      end
      printf "%s" (set_color normal)

      set pulse (math $pulse + 1)
      if test $pulse -gt $len
        set pulse 1
        set frame_idx (math $frame_idx % (count $frames) + 1)
      end

      sleep 0.06
    end
  ' &
  set -l spinner_pid $last_pid

  set -l msg (git diff --cached | claude -p "Please generate a concise, one-line conventional commit message for these changes. Output ONLY the commit message, nothing else. Use imperative mood." 2>/dev/null)

  kill $spinner_pid 2>/dev/null
  printf "\r\033[K"

  if test -z "$msg"
    echo "Failed to generate message."
    return 1
  end

  echo (set_color D97757)✻ (set_color normal)$msg
  printf "\e[?25l"
  printf "\n"
  read -P "Commit with this message? [y/n] " confirm
  if test "$confirm" = y
    git commit -m "$msg"
  end
end
