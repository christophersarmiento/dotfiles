require("options")
require("keybinds")
require("lsp")

-- Plugins
vim.pack.add({
  { src = "https://github.com/catppuccin/nvim" },
  { src = "https://github.com/neovim/nvim-lspconfig" },
  { src = "https://github.com/nvim-treesitter/nvim-treesitter" },
})

-- Treesitter
require("nvim-treesitter").install({
  "rust",
  "javascript",
  "lua",
  "go",
  "python",
  "typescript"
})

vim.api.nvim_create_autocmd("FileType", {
  pattern = { "rust", "javascript", "lua", "go", "python", "typescript" },
  callback = function()
    vim.treesitter.start()
    vim.bo.indentexpr = 'v:lua.require"nvim-treesitter".indentexpr()'
  end,
})

vim.cmd.colorscheme "catppuccin"
