import { TrueForgeUI } from "@truefoundry/trueforge-ui";
import "@truefoundry/trueforge-ui/styles.css";
import { DeadmanApprovalCard } from "./DeadmanApprovalCard";
import "./approval.css";

/**
 * DEADMAN operator console.
 *
 * This hosts TrueForge's own chat UI (so the agent, MCP tools, sessions, and the approval
 * mechanism are all the real harness) but overrides ONE slot — the tool-approval bar — with a
 * custom diff + rollback + blast-radius card. The decision itself still flows through TrueForge's
 * built-in bar underneath the card, so nothing about the safety mechanism is reimplemented.
 *
 * `server.baseUrl: "/"` talks to TrueForge through the Vite proxy (`/api` -> :8790), so the
 * console is same-origin and there is no CORS/SSE friction in dev.
 */
export function App() {
  return (
    <div style={{ height: "100dvh" }}>
      <TrueForgeUI
        server={{ type: "trueforge", baseUrl: "/" }}
        layout="sidebar"
        agentConfig={{ mode: "SingleAgent", name: "deadman" }}
        overrides={{ ToolApprovalBar: DeadmanApprovalCard }}
        onError={(e) => console.error("[console] TrueForgeUI error", e)}
      />
    </div>
  );
}
