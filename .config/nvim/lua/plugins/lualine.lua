return {
  {
    "nvim-lualine/lualine.nvim",
    dependencies = {
      {"mini-nvim/mini.icons", version = "*" },
      { "lewis6991/gitsigns.nvim" }
    },
    config = function()
      require("lualine").setup({
        options = {
          icons_enabled = true,
          theme = "catppuccin",
          component_separators = "",
          section_separators = { left = "", right = "" },
          globalstatus = true,
          disabled_filetypes = {
            statusline = {
              "snacks_dashboard",
            },
          },
        },
        sections = {
          lualine_a = { { "mode", separator = { left = "" }, right_padding = 2 } },
          lualine_b = { "branch" },
          lualine_c = {
            {
              "diagnostics",
              symbols = {
                error = " ",
                warn = " ",
                info = " ",
                hint = " ",
              },
            },
            { "filetype", icon_only = false, separator = "", padding = { left = 1, right = 1 } },
          },
          lualine_x = {
            Snacks.profiler.status(),
            {
              function() return "  " .. require("dap").status() end,
              cond = function() return package.loaded["dap"] and require("dap").status() ~= "" end,
              color = function() return { fg = Snacks.util.color("Debug") } end,
            },
            {
              require("lazy.status").updates,
              cond = require("lazy.status").has_updates,
              color = function() return { fg = Snacks.util.color("Special") } end,
            },
            {
              "diff",
              symbols = {
                added = " ",
                modified = " ",
                removed = " ",
              }
            },
          },
          lualine_y = {
            { "progress", separator = " ", padding = { left = 1, right = 0 } },
            { "location", padding = { left = 0, right = 1 } },
          },
          lualine_z = {
            {
              function()
                return " " .. os.date("%R")
              end,
              separator = {
                right = ""
              },
              left_padding = 2
            },
          },
        },
        tabline = {},
        extensions = { "lazy" },
      })
    end,
  },
}
