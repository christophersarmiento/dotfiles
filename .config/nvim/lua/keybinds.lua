vim.g.mapleader = " "
vim.keymap.set("i", "jk", "<Esc>", { noremap = true })
vim.keymap.set("n", "<leader>o", ":update<CR> :source<CR>")
vim.keymap.set("n", "<leader>w", ":w<CR>")
vim.keymap.set("n", "<leader>q", ":q<CR>")
vim.keymap.set("n", "<leader>lf", vim.lsp.buf.format)

