vim.lsp.enable({
  "rust-analyzer",
  "ts_ls",
  "lua_ls",
  "gopls"
})

vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup("my.lsp", {}),
  callback = function(args)
    local client = assert(vim.lsp.get_client_by_id(args.data.client_id))
    if client:supports_method('textDocument/completion') then
      vim.lsp.completion.enable(true, client.id, args.buf, {autotrigger = true})
      vim.keymap.set("i", "<C-space>", vim.lsp.completion.get, { desc = "trigger autocompletion" })
    end
  end,
})

vim.lsp.config['rust-analyzer'] = {
  cmd = { 'rust-analyzer' },
  filetypes = { 'rust' },
  root_markers = { 'Cargo.toml', '.git' },
  settings = {
    ["rust-analyzer"] = {
      lens = {
        debug = {
          enable = true
        },
        enable = true,
        implementations = {
          enable = true
        },
        references = {
          adt = {
            enable = true
          },
          enumVariant = {
            enable = true
          },
          method = {
            enable = true
          },
          trait = {
            enable = true
          }
        },
        run = {
          enable = true
        },
        updateTest = {
          enable = true
        }
      }
    }
  },
}

vim.lsp.config('lua_ls', {
  on_init = function(client)
    if client.workspace_folders then
      local path = client.workspace_folders[1].name
      if
          path ~= vim.fn.stdpath('config')
          and (vim.uv.fs_stat(path .. '/.luarc.json') or vim.uv.fs_stat(path .. '/.luarc.jsonc'))
      then
        return
      end
    end

    client.config.settings.Lua = vim.tbl_deep_extend('force', client.config.settings.Lua, {
      runtime = {
        version = 'LuaJIT',
        path = {
          'lua/?.lua',
          'lua/?/init.lua',
        },
      },
      -- Make the server aware of Neovim runtime files
      workspace = {
        checkThirdParty = false,
        library = {
          vim.env.VIMRUNTIME
        }
      },
      telemetry = {
        enable = false,
      }
    })
  end,
  settings = {
    Lua = {}
  }
})
