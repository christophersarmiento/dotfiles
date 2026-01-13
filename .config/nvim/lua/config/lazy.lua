local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  local lazyrepo = "https://github.com/folke/lazy.nvim.git"
  local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
  if vim.v.shell_error ~= 0 then
    vim.api.nvim_echo({
      { "Failed to clone lazy.nvim:\n", "ErrorMsg" },
      { out, "WarningMsg" },
      { "\nPress any key to exit..." },
    }, true, {})
    vim.fn.getchar()
    os.exit(1)
  end
end

vim.opt.rtp:prepend(lazypath)
vim.opt.completeopt = { "menuone", "noselect", "popup", "fuzzy", "preview" }

vim.o.number = true
vim.o.relativenumber = true
vim.o.signcolumn = "yes"
vim.o.termguicolors = true
vim.o.wrap = false
vim.o.winborder = "rounded"
vim.o.scrolloff = 999
vim.o.cursorline = true
vim.o.list = true
vim.o.listchars = "tab: ,trail:·"
vim.o.splitbelow = true
vim.o.splitright = true
vim.o.expandtab = true
vim.o.tabstop = 2
vim.o.softtabstop = 2
vim.o.shiftwidth = 2
vim.o.autoindent = true
vim.o.smartindent = true
vim.o.shiftround = true
vim.o.virtualedit = "block"
vim.o.inccommand = "split"
vim.o.swapfile = false
vim.o.clipboard = "unnamedplus"

require("lazy").setup({
  spec = {
    { "catppuccin/nvim", config = function() vim.cmd.colorscheme "catppuccin" end },
    { import = "plugins" },
  },
  defaults = {
    lazy = false,
    version = false, -- always use the latest git commit
  },
  install = {},
  checker = {
    enabled = true
  },
})
