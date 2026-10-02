import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Registers `/exit` as an alias for `/quit` — cleanly shuts pi down.
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand("exit", {
    description: "Quit pi (alias for /quit)",
    handler: async (_args, ctx) => {
      ctx.shutdown();
    },
  });
}
