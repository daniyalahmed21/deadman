import { Link } from "react-router-dom";
import { Skull, Star, ShieldCheck, RotateCcw, Ban, GitCommitVertical, FlaskConical, Siren } from "lucide-react";
import "./landing.css";

const GITHUB = "https://github.com/daniyalahmed21/deadman";

export function Landing() {
  return (
    <div className="dm">
      <nav>
        <div className="wrap navrow">
          <div className="brand">
            <span className="logo">
              <Skull size={17} color="#fff" strokeWidth={2} />
            </span>
            DEADMAN
          </div>
          <div className="navlinks">
            <a href="#features">Product</a>
            <a href="#safety">Safety</a>
            <a href="#architecture">Architecture</a>
            <a href={GITHUB}>GitHub</a>
          </div>
          <div className="navcta">
            <a className="btn btn-ghost btn-sm" href="#demo">Watch demo</a>
            <a className="btn btn-primary btn-sm" href={GITHUB}>
              <Star className="icn" fill="currentColor" strokeWidth={2} />
              Star on GitHub
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="wrap hero">
        <span className="pill"><span className="pdot" /> Runs on TrueForge</span>
        <h1 className="title">An AI SRE that remediates production <span className="accent">safely.</span></h1>
        <p className="lede">
          Every incident bot <em>diagnoses</em>. DEADMAN <strong>acts</strong>. It investigates the incident.
          Applies the fix. Cleans up after itself. Destructive actions pause for human approval. Catastrophic
          ones are refused outright.
        </p>
        <div className="herocta">
          <Link className="btn btn-primary btn-lg" to="/app">Open the cockpit</Link>
          <a className="btn btn-ghost btn-lg" href="#demo">See it work</a>
        </div>

        {/* product frame */}
        <div className="frame" id="demo">
          <div className="framebar">
            <span className="tl" /><span className="tl" /><span className="tl" />
            <span className="url">deadman cockpit</span>
          </div>
          <div className="framebody">
            <div className="statblock">
              <div className="cell"><div className="lbl">Status</div><div className="val">Healthy</div><div className="foot">real incident</div></div>
              <div className="cell"><div className="lbl">Memory used</div><div className="val">68%</div><div className="foot">348 / 512 Mi <span className="up">164 free</span></div></div>
              <div className="cell"><div className="lbl">Actions</div><div className="val">8</div><div className="foot">this session</div></div>
              <div className="cell"><div className="lbl">Refused</div><div className="val">2</div><div className="foot">by safety floor <span className="up">held</span></div></div>
            </div>
            <div className="row2">
              <div className="pcard">
                <h4>Root cause</h4>
                <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>checkout is OOMKilled: working set 451Mi meets the 256Mi limit.</p>
                <span className="chip chip-w mono">suspected rev 3 cut mem limit 512 to 256Mi 4m before onset</span>
              </div>
              <div className="pcard">
                <h4>Remediation plan &nbsp;<span className="chip chip-w">GATED</span></h4>
                <div className="kv mono"><span>memory</span><span>256Mi to 512Mi</span></div>
                <div className="kv"><span className="muted mono">rehearsed</span><span className="chip chip-s">PASS</span></div>
                <div className="kv"><span className="muted mono">recall</span><span className="mono">INC-2411 strong</span></div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* TRUST */}
      <div className="trust wrap">
        <span className="eyebrow">Built on</span>
        <div className="row">
          <span>TrueForge</span><span>MCP</span><span>Kubernetes</span><span>Redis</span><span>Claude</span>
        </div>
      </div>

      {/* 01 THE PROBLEM */}
      <section id="problem" className="wrap">
        <div className="sechead solo">
          <span className="eyebrow"><span className="ch">01</span>The problem</span>
          <h2>A diagnosis is not a fix.</h2>
          <p>
            Alerting pages you. Dashboards show you. Chatbots explain the outage back to you. At 3am none of
            them touch production. Someone still has to log in. Run the fix. Watch it hold.
          </p>
        </div>
      </section>

      {/* 02 THE SHIFT */}
      <section id="features" className="wrap">
        <div className="sechead">
          <span className="eyebrow"><span className="ch">02</span>The shift</span>
          <h2>It doesn't just tell you what's wrong. It fixes it. And undoes its own mistakes.</h2>
          <p>Graduated autonomy. Defense in depth. A live cockpit that streams every step the agent takes.</p>
        </div>
        <div className="bento">
          <div className="b span2">
            <div className="ico"><ShieldCheck size={19} strokeWidth={2} /></div>
            <h3>Graduated autonomy</h3>
            <p>Every write is routed by blast radius. The harness owns the visible safety.</p>
            <div className="tiers">
              <div className="tier"><div className="t" style={{ color: "var(--success)" }}>SAFE</div><div className="d">reversible and auto-runs</div></div>
              <div className="tier"><div className="t" style={{ color: "var(--warning)" }}>GATED</div><div className="d">needs human approval</div></div>
              <div className="tier"><div className="t" style={{ color: "var(--destructive)" }}>HARDLINE</div><div className="d">catastrophic and refused</div></div>
            </div>
          </div>
          <div className="b">
            <div className="ico"><RotateCcw size={19} strokeWidth={2} /></div>
            <h3>Auto-rollback watchdog</h3>
            <p>DEADMAN watches after every fix. If it doesn't hold it reverts and escalates. Reversibility is a primitive.</p>
          </div>
          <div className="b">
            <div className="ico"><Ban size={19} strokeWidth={2} /></div>
            <h3>Prompt-injection defense</h3>
            <p>An alert that says "delete the database" is flagged and ignored. Alerts are data. Never commands.</p>
          </div>
          <div className="b">
            <div className="ico"><GitCommitVertical size={19} strokeWidth={2} /></div>
            <h3>Change-correlation</h3>
            <p>Finds the smoking gun: the incident began 4 minutes after the memory limit was cut. Real SRE triage.</p>
          </div>
          <div className="b">
            <div className="ico"><FlaskConical size={19} strokeWidth={2} /></div>
            <h3>Sandbox rehearsal</h3>
            <p>Forks the cluster state. Proves the fix resolves it. Then applies to prod. Rehearse before you touch prod.</p>
          </div>
          <div className="b">
            <div className="ico"><Siren size={19} strokeWidth={2} /></div>
            <h3>Production alert ingestion</h3>
            <p>Monitors POST to a durable queue. Deduped, retried, dead-lettered. An alert storm never drops an incident.</p>
          </div>
        </div>
      </section>

      {/* 03 WHY IT'S SAFE */}
      <section id="architecture" className="wrap">
        <div className="sechead">
          <span className="eyebrow"><span className="ch">03</span>Why it's safe</span>
          <h2>Safe because TrueForge gates it</h2>
          <p>A monitor fires an alert into DEADMAN's durable queue. A worker opens a TrueForge session, which calls the engine over MCP. Reads are free. Writes pass a blast-radius approval gate. Every step streams to the cockpit.</p>
        </div>
        <div className="arch">
          <img src="/architecture.svg" alt="DEADMAN architecture: a monitor alert enters DEADMAN's /alerts webhook and durable BullMQ/Redis queue, a worker opens a TrueForge session that drives the DEADMAN engine on the cluster, with a cockpit and audit log" />
        </div>
      </section>

      {/* 04 THE LOOP */}
      <section id="safety" className="wrap">
        <div className="sechead">
          <span className="eyebrow"><span className="ch">04</span>The loop</span>
          <h2>Watch it fix prod. Refuse to nuke prod. Undo its own mistake.</h2>
        </div>
        <div className="steps">
          <div className="step"><div className="n">1</div><h3>Investigate</h3><p>Grounded root cause from live signals. Plus the recent change most likely to blame.</p></div>
          <div className="step"><div className="n">2</div><h3>Approve with context</h3><p>The gate shows the diff. The blast radius. The rollback plan. And a sandbox rehearsal marked PASS or FAIL before you Allow.</p></div>
          <div className="step"><div className="n">3</div><h3>Verify and hold</h3><p>The fix is applied. Verified closed-loop. Then watched. If it doesn't hold it auto-reverts.</p></div>
        </div>
      </section>

      {/* CTA */}
      <section className="wrap">
        <div className="band">
          <h2>An AI SRE with a license to act.</h2>
          <p>Open source. Built on TrueForge. Safe by construction. Safe fixes auto-run. Destructive ones gate. Catastrophic ones are refused.</p>
          <Link className="btn btn-primary btn-lg" to="/app">Open the cockpit</Link>
        </div>
      </section>

      <footer>
        <div className="wrap footrow">
          <div className="brand" style={{ fontSize: 15 }}>
            <span className="logo" style={{ width: 24, height: 24 }}><Skull size={14} color="#fff" strokeWidth={2} /></span>
            DEADMAN
          </div>
          <div>MIT licensed. Built for the TrueForge Agent Harness hackathon</div>
          <a href={GITHUB}>GitHub</a>
        </div>
      </footer>
    </div>
  );
}
