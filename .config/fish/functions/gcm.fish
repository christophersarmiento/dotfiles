function gcm --description "Generate a commit message with Pi"
  set -l diff (git diff --cached)
  if test -z "$diff"
    echo "No staged changes. Stage files first with git add."
    return 1
  end

  fish -c '
    function _cleanup --on-signal TERM --on-signal INT
      printf "\r\033[K\e[?25h"
      exit 0
    end

    set -l frames · ✢ ✳ ✶ ✻ ✽ ✻ ✶ ✳ ✢
    if test "$TERM" = xterm-ghostty
      set frames · ✢ ✳ ✶ ✻ "*" ✻ ✶ ✳ ✢
    end
    set -l verbs Accomplishing Actioning Actualizing Architecting Baking Beaming "Beboppin\'" Befuddling Billowing Blanching Bloviating Boogieing Boondoggling Booping Bootstrapping Brewing Bunning Burrowing Calculating Canoodling Caramelizing Cascading Catapulting Cerebrating Channeling Channelling Choreographing Churning Clauding Coalescing Cogitating Combobulating Composing Computing Concocting Considering Contemplating Cooking Crafting Creating Crunching Crystallizing Cultivating Deciphering Deliberating Determining Dilly-dallying Discombobulating Doing Doodling Drizzling Ebbing Effecting Elucidating Embellishing Enchanting Envisioning Evaporating Fermenting Fiddle-faddling Finagling Flambéing Flibbertigibbeting Flowing Flummoxing Fluttering Forging Forming Frolicking Frosting Gallivanting Galloping Garnishing Generating Gesticulating Germinating Gitifying Grooving Gusting Harmonizing Hashing Hatching Herding Honking Hullaballooing Hyperspacing Ideating Imagining Improvising Incubating Inferring Infusing Ionizing Jitterbugging Julienning Kneading Leavening Levitating Lollygagging Manifesting Marinating Meandering Metamorphosing Misting Moonwalking Moseying Mulling Mustering Musing Nebulizing Nesting Newspapering Noodling Nucleating Orbiting Orchestrating Osmosing Perambulating Percolating Perusing Philosophising Photosynthesizing Pollinating Pondering Pontificating Pouncing Precipitating Prestidigitating Processing Proofing Propagating Puttering Puzzling Quantumizing Razzle-dazzling Razzmatazzing Recombobulating Reticulating Roosting Ruminating Sautéing Scampering Schlepping Scurrying Seasoning Shenaniganing Shimmying Simmering Skedaddling Sketching Slithering Smooshing Sock-hopping Spelunking Spinning Sprouting Stewing Sublimating Swirling Swooping Symbioting Synthesizing Tempering Thinking Thundering Tinkering Tomfoolering Topsy-turvying Transfiguring Transmuting Twisting Undulating Unfurling Unravelling Vibing Waddling Wandering Warping Whatchamacalliting Whirlpooling Whirring Whisking Wibbling Working Wrangling Zesting Zigzagging
    set -l verb $verbs[(random 1 (count $verbs))]
    set -l label " $verb…"
    set -l dim D97757
    set -l mid E49474
    set -l bright F0B090
    set -l len (math 1 + (string length "$label"))
    set -l cycle_len (math "$len + 20")
    set -l tick 0

    printf "\e[?25l"
    while true
      set -l glyph_idx (math "floor($tick / 2) % 10 + 1")
      set -l glyph $frames[$glyph_idx]
      set -l shimmer_pos (math "$tick % $cycle_len - 10")
      set -l full "$glyph$label"

      printf "\r"
      for i in (seq 1 $len)
        set -l ch (string sub -s $i -l 1 "$full")
        set -l dist (math "abs($i - $shimmer_pos)")
        if test $dist -eq 0
          printf "%s%s" (set_color $bright) "$ch"
        else if test $dist -eq 1
          printf "%s%s" (set_color $mid) "$ch"
        else
          printf "%s%s" (set_color $dim) "$ch"
        end
      end
      printf "%s" (set_color normal)

      set tick (math "$tick + 1")
      sleep 0.05
    end
  ' &
  set -l spinner_pid $last_pid

  set -g _gcm_spinner_pid $spinner_pid
  function _gcm_interrupt --on-signal INT
    kill $_gcm_spinner_pid 2>/dev/null
    set -g _gcm_interrupted
    set -e _gcm_spinner_pid
    functions -e _gcm_interrupt
  end

  set -l msg (git diff --cached | claude -p "Please generate a concise, one-line conventional commit message for these changes. Output ONLY the commit message, nothing else. Use imperative mood. Do not wrap the message with any characters." 2>/dev/null | string collect | string trim | string replace -r '^\s+' '')
  functions -e _gcm_interrupt
  set -e _gcm_spinner_pid
  kill $spinner_pid 2>/dev/null
  wait $spinner_pid 2>/dev/null
  if set -q _gcm_interrupted; or test -z "$msg"
    printf "\r\033[2K\e[?25h"
    set -e _gcm_interrupted
    return 1
  end

  printf "\r\033[2K\e[?25h%s✻%s %s\n" (set_color D97757) (set_color normal) "$msg"
  read -P "Commit with this message? [Y/n] " confirm
  if test "$confirm" = "" -o "$confirm" = y -o "$confirm" = Y
    git commit -m "$msg"
  end
end
