return {
  {
    "nvim-treesitter/nvim-treesitter",
    branch = "main",
    build = ":TSUpdate",
    event = { "BufReadPost", "BufNewFile", "BufWritePre", "VeryLazy" },
    cmd = { "TSUpdate", "TSInstall", "TSUninstall" },
    opts = {
      ensure_installed = {
        "bash",
        "c",
        "diff",
        "go",
        "html",
        "javascript",
        "jsdoc",
        "json",
        "lua",
        "luadoc",
        "luap",
        "markdown",
        "markdown_inline",
        "printf",
        "python",
        "query",
        "regex",
        "rust",
        "toml",
        "tsx",
        "typescript",
        "vim",
        "vimdoc",
        "xml",
        "yaml",
      },
    },
    config = function(_, opts)
      vim.opt.runtimepath:append(vim.fn.stdpath("data") .. "/lazy/nvim-treesitter/runtime")
      local TS = require("nvim-treesitter")
      TS.setup(opts)

      -- Install missing parsers
      local installed = TS.get_installed and TS.get_installed() or {}
      local installed_set = {}
      for _, lang in ipairs(installed) do
        installed_set[lang] = true
      end

      local to_install = vim.tbl_filter(function(lang)
        return not installed_set[lang]
      end, opts.ensure_installed or {})

      if #to_install > 0 then
        TS.install(to_install)
      end

      -- Enable features via FileType autocmd
      vim.api.nvim_create_autocmd("FileType", {
        group = vim.api.nvim_create_augroup("treesitter_config", { clear = true }),
        callback = function(ev)
          -- Try to start highlighting
          pcall(vim.treesitter.start, ev.buf)

          -- Enable treesitter-based indentation
          vim.bo[ev.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"

          -- Enable treesitter-based folds
          vim.wo[0].foldmethod = "expr"
          vim.wo[0].foldexpr = "v:lua.vim.treesitter.foldexpr()"
          vim.wo[0].foldlevel = 99
        end,
      })
    end,
  }
}
