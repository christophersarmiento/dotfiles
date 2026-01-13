return {
  {
    "mfussenegger/nvim-dap",
    dependencies = {
      "leoluz/nvim-dap-go",
      "rcarriga/nvim-dap-ui",
      "theHamsta/nvim-dap-virtual-text",
      "nvim-neotest/nvim-nio",
      "williamboman/mason.nvim",
    },
    config = function()
      local dap = require "dap"
      local ui = require "dapui"

      require("dapui").setup()
      require("dap-go").setup()

      vim.keymap.set("n", "<space>b", dap.toggle_breakpoint, { desc = "DAP: Toggle Breakpoint" })
      vim.keymap.set("n", "<space>rb", dap.run_to_cursor, { desc = "DAP: Run to Cursor" })

      local signs = {
          DapBreakpoint = { text = "●", texthl = "DapBreakpoint", linehl = "", numhl = "" },
          DapBreakpointCondition = { text = "●", texthl = "DapBreakpointCondition", linehl = "", numhl = "" },
          DapLogPoint = { text = "◆", texthl = "DapLogPoint", linehl = "", numhl = "" },
          DapStopped = { text = "󰁕 ", texthl = "DapStopped", linehl = "DebugStoppedLine", numhl = "DebugStoppedLine" },
          DapBreakpointRejected = { text = " ", texthl = "DapBreakpointRejected", linehl = "", numhl = "" },
        }

        for name, sign in pairs(signs) do
          vim.fn.sign_define(name, sign)
        end

      -- Eval var under cursor
      vim.keymap.set("n", "<space>D", function()
        require("dapui").eval(nil, { enter = true })
      end, { desc = "DAP UI"})

      vim.keymap.set("n", "<F1>", dap.continue, { desc = "DAP: Continue" })
      vim.keymap.set("n", "<F2>", dap.step_into, { desc = "DAP: Step Into" })
      vim.keymap.set("n", "<F3>", dap.step_over, { desc = "DAP: Step Over" })
      vim.keymap.set("n", "<F4>", dap.step_out, { desc = "DAP: Step Out" })
      vim.keymap.set("n", "<F5>", dap.step_back, { desc = "DAP: Step Back" })
      vim.keymap.set("n", "<F13>", dap.restart, { desc = "DAP: Restart" })

      dap.listeners.before.attach.dapui_config = function()
        ui.open()
      end
      dap.listeners.before.launch.dapui_config = function()
        ui.open()
      end
      dap.listeners.before.event_terminated.dapui_config = function()
        ui.close()
      end
      dap.listeners.before.event_exited.dapui_config = function()
        ui.close()
      end
    end,
  },
}
