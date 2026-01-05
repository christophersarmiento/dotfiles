vim.o.number = true
vim.o.relativenumber = true
vim.o.signcolumn = "yes"
vim.o.termguicolors = true
vim.o.wrap = false
vim.o.expandtab = true
vim.o.tabstop = 2
vim.o.softtabstop = 2
vim.o.shiftwidth = 2
vim.o.swapfile = false
vim.o.winborder = "rounded"

vim.g.mapleader = " "

vim.keymap.set('i', 'jk', '<Esc>', { noremap = true })
vim.keymap.set('n', '<leader>o', ':update<CR> :source<CR>')
vim.keymap.set('n', '<leader>w', ':w<CR>')
vim.keymap.set('n', '<leader>q', ':q<CR>')
vim.keymap.set('n', '<leader>lf', vim.lsp.buf.format)

vim.pack.add({
  {src = "https://github.com/catppuccin/nvim"},
  {src = 'https://github.com/neovim/nvim-lspconfig'},
})

local function get_system_appearance()
  local handle = io.popen("defaults read -g AppleInterfaceStyle 2>/dev/null")
  local result = handle:read("*a")
  handle:close()
  return result:match("Dark") and "dark" or "light"
end

if get_system_appearance() == "dark" then
  vim.cmd('colorscheme catppuccin-mocha')
else
  vim.cmd('colorscheme catppuccin-latte')
end
