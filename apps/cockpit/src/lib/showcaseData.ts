// AUTO-CAPTURED from a live engine run (firing OOMKill incident, agent diagnosed). Frozen real
// data for the Vercel showcase (no backend). Em dashes stripped to match UI house style.
import type { DashboardState, AgentEvent } from "@deadman/shared";

export const showcaseState = {
  "mode": "kind",
  "service": "checkout",
  "resolved": false,
  "health": {
    "healthy": false,
    "memLimitMib": 256,
    "replicas": 1,
    "pods": [
      {
        "name": "checkout-7dfd449998-n7ctw",
        "phase": "Running",
        "restarts": 5
      }
    ]
  },
  "metrics": {
    "workingSetMib": 0,
    "cpuMillis": 0
  },
  "investigation": {
    "root_cause": "The checkout container's memory limit of 256Mi is set below the workload's steady-state working set, causing the kernel to OOMKill the container (exit 137) and trigger repeated pod restarts.",
    "evidence": [
      "suspected change: rev 3 \"mem limit 512Mi -> 256Mi (cost-saving: reduced memory allocation)\" ~4m before onset (confidence 1)",
      "pod checkout-7dfd449998-n7ctw: 5 restarts, last state OOMKilled (exit 137)",
      "container memory limit is 256Mi",
      "no correlated deploy, config change, or traffic spike in the window"
    ],
    "validity_score": 0.91,
    "is_noise": false,
    "change": {
      "suspected": {
        "revision": 3,
        "at": 1788089188000,
        "kind": "mem_limit",
        "summary": "mem limit 512Mi -> 256Mi (cost-saving: reduced memory allocation)",
        "memLimitMib": 256,
        "previousMemLimitMib": 512
      },
      "confidence": 1,
      "minutesBefore": 4,
      "candidates": [
        {
          "change": {
            "revision": 3,
            "at": 1788089188000,
            "kind": "mem_limit",
            "summary": "mem limit 512Mi -> 256Mi (cost-saving: reduced memory allocation)",
            "memLimitMib": 256,
            "previousMemLimitMib": 512
          },
          "score": 1
        },
        {
          "change": {
            "revision": 2,
            "at": 1788089188000,
            "kind": "deploy",
            "summary": "rollout revision 2 (cost-saving: reduced memory allocation)"
          },
          "score": 0.2
        }
      ],
      "reason": "Most likely suspect: revision 3 (mem limit 512Mi -> 256Mi (cost-saving: reduced memory allocation)) ~4m before onset - a plausible cause of the OOM."
    }
  },
  "insights": {
    "recommendedAction": "bump_memory",
    "recall": {
      "id": "INC-checkout-1",
      "service": "checkout",
      "signal": "OOMKilled",
      "rootCause": "The checkout container's memory limit of 256Mi is set below the workload's steady-state working set, causing the kernel to repeatedly OOMKill the container (exit 137).",
      "fix": [
        "bump_memory"
      ],
      "score": 1,
      "strength": "strong",
      "agoDays": 1
    },
    "preview": {
      "action": "bump_memory",
      "target": "checkout",
      "tier": "GATED",
      "warnings": [],
      "summary": "Raise checkout memory limit 256Mi -> 512Mi (rolling restart, 1 pods)",
      "changes": [
        {
          "path": "spec.template.spec.containers[0].resources.limits.memory",
          "before": "256Mi",
          "after": "512Mi"
        }
      ],
      "rawDiff": "@@ -7,7 +7,7 @@\n     kubernetes.io/change-cause: 'cost-saving: reduced memory allocation'\n   labels:\n     app: checkout\n   name: checkout\n@@ -46,7 +46,7 @@\n         name: app\n         resources:\n           limits:\n-            memory: 256Mi\n+            memory: 512Mi\n           requests:\n             memory: 128Mi\n         terminationMessagePath: /dev/termination-log",
      "blastRadius": {
        "podsAffected": 1,
        "disruption": "rolling",
        "stateful": false,
        "reversible": true,
        "severity": "medium"
      },
      "rollback": {
        "method": "re-apply previous limit",
        "inverse": "bump_memory checkout 256",
        "beforeState": {
          "memory": "256Mi"
        },
        "note": "reversible prod config change"
      },
      "destructive": true
    },
    "rehearsal": {
      "action": "bump_memory",
      "target": "checkout",
      "backend": "kind",
      "rehearsed": true,
      "pass": true,
      "before": {
        "healthy": false,
        "memLimitMib": 256
      },
      "after": {
        "healthy": true,
        "memLimitMib": 512
      },
      "detail": "clone ran healthy at 512Mi (no OOM in the watch window; idle load only, not a load test)"
    }
  },
  "audit": [],
  "ts": 1788089482816
} as unknown as DashboardState;

export const showcaseEvents = [
  {
    "seq": 1,
    "ts": 1788089422177,
    "kind": "signal",
    "phase": "triage",
    "severity": "info",
    "message": "Alert received: \"checkout OOMKilled\" (prometheus, critical) - queued for investigation"
  },
  {
    "seq": 2,
    "ts": 1788089446177,
    "kind": "phase",
    "phase": "investigate",
    "target": "checkout",
    "severity": "info",
    "message": "Investigating checkout: checkout OOMKilled in prod, pods restarting repeatedly"
  },
  {
    "seq": 3,
    "ts": 1788089453177,
    "kind": "signal",
    "phase": "investigate",
    "target": "checkout",
    "severity": "warn",
    "message": "Most likely suspect: revision 3 (mem limit 512Mi -> 256Mi (cost-saving: reduced memory allocation)) ~4m before onset - a plausible cause of the OOM."
  },
  {
    "seq": 4,
    "ts": 1788089456177,
    "kind": "signal",
    "phase": "investigate",
    "target": "checkout",
    "severity": "warn",
    "message": "Root cause: The checkout container's memory limit of 256Mi is set below the workload's steady-state working set, causing the kernel to OOMKill the container (exit 137) and trigger repeated pod restarts. (validity 0.91)"
  },
  {
    "seq": 5,
    "ts": 1788089467177,
    "kind": "signal",
    "phase": "remediate",
    "target": "checkout",
    "severity": "info",
    "message": "Recall: strong match to INC-checkout-1 (1d ago) - previously resolved by bump_memory"
  }
] as unknown as AgentEvent[];

export const showcaseIncidents = {
  "incidents": [
    {
      "id": "INC-checkout-6",
      "service": "checkout",
      "startedAt": 1788089456206,
      "resolved": false,
      "isNoise": false,
      "rootCause": "The checkout container's memory limit of 256Mi is set below the workload's steady-state working set, causing the kernel to OOMKill the container (exit 137) and trigger repeated pod restarts.",
      "validity": 0.91,
      "alert": "{\"alertname\":\"checkout OOMKilled\",\"severity\":\"critical\",\"source\":\"prometheus\",\"summary\":\"checkout OOMKilled in prod, pods restarting repeatedly, memory pressure\"}",
      "evidence": [
        "suspected change: rev 3 \"mem limit 512Mi -> 256Mi (cost-saving: reduced memory allocation)\" ~4m before onset (confidence 1)",
        "pod checkout-7dfd449998-n7ctw: 5 restarts, last state OOMKilled (exit 137)",
        "container memory limit is 256Mi",
        "no correlated deploy, config change, or traffic spike in the window"
      ],
      "memLimitBefore": 256,
      "timeline": [],
      "actions": 0,
      "refusals": 0
    },
    {
      "id": "INC-checkout-5",
      "service": "checkout",
      "startedAt": 1788088089586,
      "resolved": false,
      "isNoise": true,
      "rootCause": "No active failure exists on the checkout service; the alert appears to be noise, as the pod shows a 512Mi memory limit with no restarts and no OOMKill termination events.",
      "validity": 0.2,
      "alert": "checkout OOMKilled in prod, pods restarting",
      "evidence": [
        "memory limit 512Mi",
        "no restarts",
        "no OOMKill termination"
      ],
      "memLimitBefore": 512,
      "timeline": [],
      "actions": 0,
      "refusals": 0
    },
    {
      "id": "INC-checkout-4",
      "service": "checkout",
      "startedAt": 1788087988309,
      "resolved": false,
      "isNoise": true,
      "rootCause": "No active failure was detected on the checkout service; the deterministic investigation found the memory limit at 512Mi with no restarts and no OOMKill termination, indicating the alert is likely noise.",
      "validity": 0.2,
      "alert": "{\"alertname\":\"checkout OOMKilled\",\"severity\":\"critical\",\"source\":\"prometheus\",\"summary\":\"checkout OOMKilled in prod, pods restarting\"}",
      "evidence": [
        "memory limit 512Mi",
        "no restarts",
        "no OOMKill termination"
      ],
      "memLimitBefore": 512,
      "timeline": [],
      "actions": 0,
      "refusals": 0
    },
    {
      "id": "INC-checkout-3",
      "service": "checkout",
      "startedAt": 1788087918244,
      "resolved": false,
      "isNoise": true,
      "rootCause": "No root cause exists; the alert is a false positive, as the checkout service shows a 512Mi memory limit with no restarts and no OOMKill termination events.",
      "validity": 0.2,
      "alert": "{\"alertname\": \"checkout OOMKilled\", \"severity\": \"critical\", \"source\": \"prometheus\", \"summary\": \"checkout OOMKilled in prod, pods restarting\"}",
      "evidence": [
        "memory limit 512Mi",
        "no restarts",
        "no OOMKill termination"
      ],
      "memLimitBefore": 512,
      "timeline": [],
      "actions": 0,
      "refusals": 0
    },
    {
      "id": "INC-checkout-2",
      "service": "checkout",
      "startedAt": 1788087817697,
      "resolved": false,
      "isNoise": true,
      "rootCause": "No root cause identified; the alert appears to be noise, as the deterministic investigation found the checkout service operating within its 512Mi memory limit with no restarts and no OOMKill terminations.",
      "validity": 0.2,
      "alert": "checkout OOMKilled in prod, pods restarting",
      "evidence": [
        "memory limit 512Mi",
        "no restarts",
        "no OOMKill termination"
      ],
      "memLimitBefore": 512,
      "timeline": [],
      "actions": 0,
      "refusals": 0
    },
    {
      "id": "INC-checkout-1",
      "service": "checkout",
      "startedAt": 1788087740182,
      "resolvedAt": 1788087803316,
      "resolved": true,
      "isNoise": false,
      "rootCause": "The checkout container's memory limit of 256Mi is below the workload's steady-state working set, causing the kernel to repeatedly OOMKill (exit 137) the pod.",
      "validity": 0.91,
      "alert": "{\"alertname\": \"checkout OOMKilled\", \"severity\": \"critical\", \"source\": \"prometheus\", \"summary\": \"checkout OOMKilled in prod, pods restarting\"}",
      "evidence": [
        "pod checkout-7dfd449998-4jlkr: 20 restarts, last state OOMKilled (exit 137)",
        "container memory limit is 256Mi",
        "no correlated deploy, config change, or traffic spike in the window"
      ],
      "memLimitBefore": 256,
      "memLimitAfter": 512,
      "timeline": [
        {
          "seq": 1,
          "action": "bump_memory",
          "target": "checkout",
          "tier": "GATED",
          "before": 256,
          "after": 512,
          "outcome": "bumped checkout memory 256Mi → 512Mi",
          "isError": false
        }
      ],
      "actions": 1,
      "refusals": 0
    }
  ]
};

export const showcaseCost = {
  "model": "claude-opus-4-8",
  "narration": true,
  "investigations": 6,
  "llmCalls": 6,
  "inputTokens": 2939,
  "outputTokens": 2826,
  "usd": 0.256035,
  "priceInPerMTok": 15,
  "priceOutPerMTok": 75,
  "perService": [
    {
      "service": "checkout",
      "inputTokens": 2939,
      "outputTokens": 2826,
      "usd": 0.256035
    }
  ]
};

export const showcasePolicy = {
  "tiers": [
    {
      "tier": "SAFE",
      "behavior": "Auto-run (reversible, low blast radius)",
      "tools": [
        "restart_pod"
      ]
    },
    {
      "tier": "GATED",
      "behavior": "Human approval in TrueForge (destructive, irreversible)",
      "tools": [
        "bump_memory",
        "rollback_deploy",
        "delete_pvc",
        "scale_to_zero",
        "scale_deployment",
        "cordon_node",
        "drain_node"
      ]
    },
    {
      "tier": "HARDLINE",
      "behavior": "Refused outright (no recovery path, never callable)",
      "tools": [
        "delete_primary_database",
        "drain_last_node",
        "delete_namespace"
      ]
    }
  ],
  "hardlinePatterns": [
    "delete\\s+(the\\s+)?(primary|only)\\s+database",
    "terminate\\s+(the\\s+)?last\\s+(healthy\\s+)?replica",
    "delete\\s+namespace",
    "scale\\s+core\\s+infra(structure)?\\s+to\\s*0",
    "drop\\s+(table|schema|database)"
  ]
};
