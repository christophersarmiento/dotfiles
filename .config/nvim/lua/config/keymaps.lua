vim.g.mapleader = " "
vim.g.maplocalleader = "\\"
vim.keymap.set("i", "jk", "<Esc>", { noremap = true })
vim.keymap.set("n", "<leader>w", ":w<CR>", { desc = "Save file" })
vim.keymap.set("n", "<leader>q", ":q<CR>", { desc = "Quit Neovim" })
vim.keymap.set("n", "<leader>cf", vim.lsp.buf.format, { desc = "Format code" })
-- vim.keymap.set({ "n", "v" }, "<leader>d", '"_d', { desc = "Delete to black hole register", nowait = true })

vim.keymap.set("n", "<leader>p", function()
  local count = vim.v.count
  if count > 0 then
    vim.cmd("+" .. count .. "put")
  else
    vim.cmd("put")
  end
end, { desc = "Paste N lines below", nowait = true })


vim.keymap.set("n", "<leader>cd", function()
  -- Toggle Diagnostics
  local diagnostic_state = not vim.diagnostic.is_enabled()
  vim.diagnostic.enable(diagnostic_state)

  local msg = diagnostic_state and "Diagnostics Enabled" or "Diagnostics Disabled"
  local icon = diagnostic_state and " " or " "

  Snacks.notifier.notify(msg, "info", {
    title = "LSP",
    icon = icon
  })
end, { desc = "Toggle Diagnostics" })

vim.keymap.set("n", "<leader>o", function()
  vim.cmd("update")
  vim.cmd("source %")
  print("File sourced!")
end, { desc = "Save and Source file" })
