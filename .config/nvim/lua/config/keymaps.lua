vim.g.mapleader = " "
vim.g.maplocalleader = "\\"
vim.keymap.set("i", "jk", "<Esc>", { noremap = true })
vim.keymap.set("n", "<leader>w", ":w<CR>", { desc = "Save file" })
vim.keymap.set("n", "<leader>q", ":q<CR>", { desc = "Quit Neovim" })
vim.keymap.set("n", "<leader>lc", vim.lsp.buf.format, { desc = "LSP: Format code"})
vim.keymap.set("n", "<leader>d", function() vim.diagnostic.enable(not vim.diagnostic.is_enabled()) end, { desc = "Toggle Diagnostics" })

vim.keymap.set("n", "<leader>o", function()
  vim.cmd("update")
  vim.cmd("source %")
  print("File sourced!")
end, { desc = "Save and Source file" })
