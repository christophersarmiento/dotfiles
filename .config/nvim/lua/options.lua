-- Line numbers
vim.o.number = true
vim.o.relativenumber = true

-- UI
vim.o.signcolumn = "yes"
vim.o.termguicolors = true
vim.o.wrap = false
vim.o.winborder = "rounded"
vim.o.scrolloff = 999

-- Splits
vim.o.splitbelow = true
vim.o.splitright = true

-- Indentation
vim.o.expandtab = true
vim.o.tabstop = 2
vim.o.softtabstop = 2
vim.o.shiftwidth = 2

vim.o.virtualedit = "block"
vim.o.inccommand = "split"

-- System
vim.o.swapfile = false
vim.o.clipboard = "unnamedplus"

vim.opt.completeopt = { "menuone", "noselect", "popup", "fuzzy", "preview" }

vim.diagnostic.config({
  virtual_lines = true,
})
