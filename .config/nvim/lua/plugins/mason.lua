return {
  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPost", "BufNewFile", "BufWritePre" },
    dependencies = {
      "mason.nvim",
      "mason-org/mason-lspconfig.nvim",
    },
    opts = {
      diagnostics = {
        underline = true,
        update_in_insert = false,
        virtual_text = {
          spacing = 4,
          source = "if_many",
          prefix = "●",
        },
        virtual_lines = false,
        severity_sort = true,
        signs = {
          text = {
            -- [vim.diagnostic.severity.ERROR] = " ",
            -- [vim.diagnostic.severity.WARN] = " ",
            -- [vim.diagnostic.severity.HINT] = " ",
            -- [vim.diagnostic.severity.INFO] = " ",
          },
        },
      },
      inlay_hints = {
        enabled = true,
        exclude = {},
      },
      servers = {
        lua_ls = {
          settings = {
            Lua = {
              workspace = {
                checkThirdParty = false,
              },
              codeLens = {
                enable = true,
              },
              completion = {
                callSnippet = "Replace",
              },
              hint = {
                enable = true,
                setType = false,
                paramType = true,
                paramName = "Disable",
                semicolon = "Disable",
                arrayIndex = "Disable",
              },
            },
          },
        },
        basedpyright = {
          settings = {
            basedpyright = {
              analysis = {
                autoSearchPaths = true,
                useLibraryCodeForTypes = true,
                diagnosticMode = "openFilesOnly",
                typeCheckingMode = "basic",
                diagnosticSeverityOverrides = {
                  -- Silence the "partially unknown" warnings seen in your screenshot
                  reportUnknownMemberType = "none",
                  reportUnknownVariableType = "none",
                  reportUnknownArgumentType = "none",
                  reportUnknownParameterType = "none",
                  reportAny = "none",
                },
                inlayHints = {
                  variableTypes = false,
                  callArgumentNames = false,
                  functionReturnTypes = false,
                  genericTypes = false,
                },
              },
            },
          },
        },
      },
    },
    config = function(_, opts)
      -- Setup diagnostics
      vim.diagnostic.config(opts.diagnostics)
      vim.diagnostic.enable(false)

      -- Setup keymaps on LspAttach
      vim.api.nvim_create_autocmd("LspAttach", {
        group = vim.api.nvim_create_augroup("lsp_attach_keymaps", { clear = true }),
        callback = function(ev)
          local buf = ev.buf
          local client = vim.lsp.get_client_by_id(ev.data.client_id)

          local map = function(mode, lhs, rhs, desc)
            vim.keymap.set(mode, lhs, rhs, { buffer = buf, desc = desc })
          end

          -- Navigation
          map("n", "gd", vim.lsp.buf.definition, "Goto Definition")
          map("n", "gr", vim.lsp.buf.references, "References")
          map("n", "gI", vim.lsp.buf.implementation, "Goto Implementation")
          map("n", "gy", vim.lsp.buf.type_definition, "Goto Type Definition")
          map("n", "gD", vim.lsp.buf.declaration, "Goto Declaration")

          -- Hover/Help
          map("n", "K", vim.lsp.buf.hover, "Hover")
          map("n", "gK", vim.lsp.buf.signature_help, "Signature Help")
          map("i", "<C-k>", vim.lsp.buf.signature_help, "Signature Help")

          -- Actions
          map({ "n", "x" }, "<leader>ca", vim.lsp.buf.code_action, "Code Action")
          map("n", "<leader>cr", vim.lsp.buf.rename, "Rename")
          map("n", "<leader>cl", function() Snacks.picker.lsp_config() end, "Lsp Info")
          map("n", "<leader>cR", function() Snacks.rename.rename_file() end, "Rename File")

          -- Word navigation with Snacks
          if client and client:supports_method("textDocument/documentHighlight") then
            map("n", "]]", function() Snacks.words.jump(vim.v.count1) end, "Next Reference")
            map("n", "[[", function() Snacks.words.jump(-vim.v.count1) end, "Prev Reference")
            map("n", "<a-n>", function() Snacks.words.jump(vim.v.count1, true) end, "Next Reference")
            map("n", "<a-p>", function() Snacks.words.jump(-vim.v.count1, true) end, "Prev Reference")
          end

          -- Inlay hints toggle
          if client and client:supports_method("textDocument/inlayHint") then
            map("n", "<leader>ch", function()
              local is_enabled = not vim.lsp.inlay_hint.is_enabled({ bufnr = buf })
              vim.lsp.inlay_hint.enable(is_enabled, { bufnr = buf })

              local msg = is_enabled and "Inlay Hints Disabled" or "Inlay Hints Enabled"
              local icon = is_enabled and " " or " "

              Snacks.notifier.notify(msg, "info", {
                title = "LSP",
                icon = icon
              })
            end, "Toggle Inlay Hints")
          end
        end,
      })

      -- Configure servers
      for server, server_opts in pairs(opts.servers) do
        vim.lsp.config(server, server_opts)
      end

      -- Setup mason-lspconfig
      local servers_to_install = vim.tbl_keys(opts.servers)
      require("mason-lspconfig").setup({
        ensure_installed = servers_to_install,
        automatic_enable = true,
      })
    end,
  },
  {
    "mason-org/mason.nvim",
    build = ":MasonUpdate",
    opts = {}
  },
  {
    "mason-org/mason-lspconfig.nvim",
    opts = {},
    dependencies = {
      { "mason-org/mason.nvim", opts = {} },
      "neovim/nvim-lspconfig",
    }
  },
  {
    "WhoIsSethDaniel/mason-tool-installer.nvim",
    config = function()
      require("mason-tool-installer").setup({})
    end
  },
  {
    "folke/lazydev.nvim",
    ft = "lua",
    opts = {
      library = {
        { path = "${3rd}/luv/library", words = { "vim%.uv" } },
        { path = "snacks.nvim",        words = { "Snacks" } },
      },
    },
  }
}
