return {
  {
    "saghen/blink.cmp",
    dependencies = {
      { "rafamadriz/friendly-snippets" },
      { "echasnovski/mini.icons",      version = "*" },
      {
        "onsails/lspkind.nvim",
        config = function()
          require("lspkind").init({
            mode = "symbol",
            preset = "default",

            symbol_map = {
              Variable = "󰘧",
              Property = "",
              Field = "",
              TypeParameter = "",
            },
          })
        end,
      },
    },
    version = "1.*",
    ---@module "blink.cmp"
    ---@type blink.cmp.Config
    opts = {
      keymap = { preset = "super-tab" },

      appearance = {
        nerd_font_variant = "mono"
      },

      completion = {
        documentation = {
          auto_show = false
        },
        menu = {
          draw = {
            components = {
              kind_icon = {
                ellipsis = false,
                text = function(ctx)
                  if vim.tbl_contains({ "Path" }, ctx.source_name) then
                    local ok, mini_icon, _ = pcall(require("mini.icons").get, ctx.item.data.type, ctx.label)
                    if ok and mini_icon then return mini_icon .. ctx.icon_gap end
                  end

                  local lspkind_ok, lspkind = pcall(require, "lspkind")
                  local icon = lspkind_ok and lspkind.symbolic and lspkind.symbolic(ctx.kind, { mode = "symbol" }) or ""
                  return icon .. ctx.icon_gap
                end,

                highlight = function(ctx)
                  if vim.tbl_contains({ "Path" }, ctx.source_name) then
                    local ok, mini_icon, mini_hl = pcall(require("mini.icons").get, ctx.item.data.type, ctx.label)
                    if ok and mini_icon then return mini_hl end
                  end
                  return ctx.kind_hl
                end,
              },

              kind = {
                highlight = function(ctx)
                  if vim.tbl_contains({ "Path" }, ctx.source_name) then
                    local ok, mini_icon, mini_hl = pcall(require("mini.icons").get, ctx.item.data.type, ctx.label)
                    if ok and mini_icon then return mini_hl end
                  end
                  return ctx.kind_hl
                end,
              }
            }
          }
        }
      },

      sources = {
        default = { "lazydev", "lsp", "path", "snippets", "buffer" },
        providers = {
          lazydev = {
            name = "LazyDev",
            module = "lazydev.integrations.blink",
            score_offset = 100,
          },
        },
      },
      fuzzy = { implementation = "prefer_rust_with_warning" }
    },
    opts_extend = { "sources.default" }
  }
}
