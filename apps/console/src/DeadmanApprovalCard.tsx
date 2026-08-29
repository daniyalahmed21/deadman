import { ToolApprovalBar, type ToolApprovalBarProps } from "@truefoundry/trueforge-ui";
import { useTrueFoundryApprovals } from "@truefoundry/assistant-ui-runtime";

/**
 * Custom tool-approval slot: DEADMAN's diff + rollback + blast-radius card.
 *
 * TrueForge renders this in place of the default approval bar when a gated (destructive) tool is
 * awaiting a human. We READ the pending call's arguments via `useTrueFoundryApprovals()` (the args
 * carry the engine's `preview`), render a branded decision card, and then delegate the actual
 * Allow/Deny to the built-in `ToolApprovalBar` underneath — so the safety mechanism is never
 * reimplemented, only re-skinned. If no preview is present the card degrades to the raw args.
 */

/** Optional structured preview the engine attaches to a gated tool's args (see engine tools). */
interface Preview {
  tier?: string;
  blastRadius?: string;
  diff?: string;
  rollback?: string;
  rehearsed?: string;
  recall?: string;
  summary?: string;
}

function asPreview(args: Record<string, unknown> | undefined): Preview | null {
  const p = args?.preview;
  return p && typeof p === "object" ? (p as Preview) : null;
}

/**
 * Per-tool inference, so the card is rich from just (toolName, args) even when the engine sends no
 * structured `preview`. The engine's `preview` always wins when present.
 */
function inferPreview(toolName: string, args: Record<string, unknown> | undefined): Preview {
  const target = typeof args?.target === "string" ? args.target : "the target";
  const mib = typeof args?.mib === "number" ? args.mib : undefined;
  const replicas = typeof args?.replicas === "number" ? args.replicas : undefined;
  const node = typeof args?.node === "string" ? args.node : "the node";
  switch (toolName) {
    case "bump_memory":
      return {
        blastRadius: `deployment ${target}`,
        diff: `- resources.limits.memory: <current>\n+ resources.limits.memory: ${mib ?? "?"}Mi`,
        rollback: "restore the previous memory limit (watchdog reverts if it does not hold)",
      };
    case "rollback_deploy":
      return { blastRadius: `deployment ${target}`, diff: `rollout ${target} -> previous revision`, rollback: "roll forward to the current revision" };
    case "scale_deployment":
      return { blastRadius: `deployment ${target}`, diff: `- spec.replicas: <current>\n+ spec.replicas: ${replicas ?? "?"}`, rollback: "scale back to the previous replica count" };
    case "scale_to_zero":
      return { blastRadius: `service ${target} — goes DOWN`, diff: `- spec.replicas: <current>\n+ spec.replicas: 0`, rollback: "scale back up to restore the service" };
    case "delete_pvc":
      return { blastRadius: `data — ${target}`, diff: `delete PersistentVolumeClaim ${target}`, rollback: "IRREVERSIBLE — data cannot be recovered" };
    case "cordon_node":
      return { blastRadius: `node ${node}`, diff: `cordon ${node} (unschedulable)`, rollback: "uncordon the node" };
    case "drain_node":
      return { blastRadius: `node ${node} — evicts all pods`, diff: `drain ${node}`, rollback: "uncordon; pods reschedule" };
    default:
      return { blastRadius: `${target}`, rollback: "revert the change on failure" };
  }
}

export function DeadmanApprovalCard(props: ToolApprovalBarProps) {
  const { pending } = useTrueFoundryApprovals();
  const match = pending.find((p) => p.toolName === props.toolName) ?? pending[0];
  const args = match?.args;
  // Engine-provided preview wins; otherwise infer from the tool + args so the card is never bare.
  const inferred = inferPreview(props.toolName, args);
  const preview: Preview = { ...inferred, ...(asPreview(args) ?? {}) };
  const tier = preview.tier ?? "GATED";
  const summary = preview.summary;

  return (
    <div className="dm-approval">
      <div className="dm-approval__head">
        <span className={`dm-tier dm-tier--${tier.toLowerCase()}`}>{tier}</span>
        <span className="dm-tool">{props.toolName}</span>
        {preview?.blastRadius && <span className="dm-blast">blast radius: {preview.blastRadius}</span>}
      </div>

      {summary && <p className="dm-summary">{summary}</p>}

      {preview?.diff ? (
        <pre className="dm-diff">{preview.diff}</pre>
      ) : (
        match?.argsText && <pre className="dm-diff dm-diff--raw">{match.argsText}</pre>
      )}

      {(preview?.rehearsed || preview?.recall) && (
        <div className="dm-meta">
          {preview?.rehearsed && (
            <span className="dm-chip">
              rehearsed <strong>{preview.rehearsed}</strong>
            </span>
          )}
          {preview?.recall && (
            <span className="dm-chip">
              recall <strong>{preview.recall}</strong>
            </span>
          )}
        </div>
      )}

      <div className="dm-rollback">
        <span className="dm-rollback__label">Rollback</span>
        <span className="dm-rollback__plan">{preview?.rollback ?? "revert the patch on failure"}</span>
      </div>

      {/* The real decision path: TrueForge's built-in bar, fully wired (Allow / Deny + reason). */}
      <ToolApprovalBar {...props} />
    </div>
  );
}
