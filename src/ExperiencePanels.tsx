import { useEffect, useRef } from "react";
import { ArrowUpRight, X, Pause, Play, RotateCcw } from "lucide-react";
import { AUTOMATION, type Automation } from "./town";
import {
  COMPARISON_SECONDS,
  COMPARISON_SPEED,
  type ComparisonSnapshot,
} from "./comparison";

export function ComparisonPanel({
  snapshot,
  selected,
  eventName,
  onSelect,
  onClose,
  onPause,
  onRestart,
}: {
  snapshot: ComparisonSnapshot;
  selected: "direct" | "protected";
  eventName: string;
  onSelect: (view: "direct" | "protected") => void;
  onClose: () => void;
  onPause: () => void;
  onRestart: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  return (
    <aside
      className="comparison-panel"
      aria-label="Same traffic comparison"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <button
        ref={close}
        className="icon-button experience-close"
        aria-label="Back to playground"
        onClick={onClose}
      >
        <X size={16} />
      </button>
      <span className="eyebrow">SAME TRAFFIC. TWO OUTCOMES.</span>
      <h2>{eventName}</h2>
      <p className="comparison-intro">
        Fresh endpoints. Same incoming events.
        <br />
        Hookdeck is the only difference.
      </p>
      <div className="comparison-clock">
        <span>
          {snapshot.complete
            ? "Replay complete"
            : snapshot.paused
              ? "Replay paused"
              : `Replaying at ${COMPARISON_SPEED}×`}
        </span>
        <b>
          {Math.round(snapshot.elapsed)} / {COMPARISON_SECONDS}s
        </b>
      </div>
      <progress
        aria-label="Comparison replay progress"
        max={COMPARISON_SECONDS}
        value={snapshot.elapsed}
      />
      <div
        className="comparison-views"
        role="group"
        aria-label="Choose which delivery route to watch"
      >
        <button
          aria-pressed={selected === "direct"}
          onClick={() => onSelect("direct")}
        >
          Direct delivery
        </button>
        <button
          aria-pressed={selected === "protected"}
          onClick={() => onSelect("protected")}
        >
          With Hookdeck
        </button>
      </div>
      <table className="comparison-table">
        <caption className="sr-only">
          Delivery outcomes for identical traffic
        </caption>
        <thead>
          <tr>
            <th scope="col">Delivery copies</th>
            <th scope="col">Direct</th>
            <th scope="col">Hookdeck</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ["Received", "received"],
              ["Delivered", "delivered"],
              ["Still queued", "waiting"],
              ["On the way", "delivering"],
              ["Failed", "lost"],
            ] as const
          ).map(([label, key]) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td>
                {Math.round(snapshot.direct[key]).toLocaleString("en-US")}
              </td>
              <td>
                {Math.round(snapshot.protected[key]).toLocaleString("en-US")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="comparison-note">
        Queued and in-flight events still need delivery. Counts include copies
        sent to your automation.
      </p>
      <details className="comparison-assumptions">
        <summary>How this comparison works</summary>
        <p>
          Both runs use the same 60-second traffic pattern, connected providers
          and endpoint capacity. Endpoints start online unless you put them into
          maintenance. Hookdeck uses your current delivery limit. Direct
          delivery has no provider retries in this model. This is a simulation,
          not a product benchmark. Your original run is paused and preserved.
        </p>
      </details>
      <footer>
        <button className="experience-primary" onClick={onClose}>
          Back to playground
        </button>
        <button
          className="icon-button"
          aria-label={
            snapshot.complete
              ? "Run comparison again"
              : snapshot.paused
                ? "Resume comparison"
                : "Pause comparison"
          }
          onClick={snapshot.complete ? onRestart : onPause}
        >
          {snapshot.complete ? (
            <RotateCcw size={16} />
          ) : snapshot.paused ? (
            <Play size={16} />
          ) : (
            <Pause size={16} />
          )}
        </button>
      </footer>
    </aside>
  );
}

const webhookDocs =
  "https://hookdeck.com/docs/use-cases/receive-webhooks/quickstart";
const endpointSetup = {
  n8n: {
    text: "Publish an n8n workflow with a Webhook node and copy its Production URL.",
    href: "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/",
  },
  zapier: {
    text: "Create a Catch Hook trigger in Webhooks by Zapier and copy its webhook URL.",
    href: "https://help.zapier.com/hc/en-us/articles/8496083355661-How-to-get-started-with-Webhooks-by-Zapier",
  },
  make: {
    text: "Add a Custom webhook in Make and copy the webhook URL for your scenario.",
    href: "https://help.make.com/webhooks",
  },
};
export function SetupPanel({ automation }: { automation: Automation | null }) {
  const name = automation ? AUTOMATION[automation].name : "your application";
  return (
    <>
      <span className="eyebrow">FROM PLAYGROUND TO PRODUCTION</span>
      <h2>Protect {automation ? `your ${name} webhooks` : name}.</h2>
      <p className="dialog-note">
        Put Hookdeck between your webhook providers and {name}.
      </p>
      <ol className="setup-steps">
        <li>
          <b>Prepare your endpoint.</b>
          <p>
            {automation
              ? endpointSetup[automation].text
              : "Use your application’s HTTPS webhook endpoint as the destination."}
          </p>
          {automation && (
            <a
              href={endpointSetup[automation].href}
              target="_blank"
              rel="noreferrer"
            >
              {name} webhook guide <ArrowUpRight size={14} />
            </a>
          )}
        </li>
        <li>
          <b>Connect it through Hookdeck.</b>
          <p>
            Create a webhook source and an HTTP destination pointing to that
            URL. Set a delivery limit your endpoint can handle and configure
            retries.
          </p>
          <a href={webhookDocs} target="_blank" rel="noreferrer">
            Hookdeck setup guide <ArrowUpRight size={14} />
          </a>
        </li>
        <li>
          <b>Send providers to Hookdeck.</b>
          <p>
            Use your Hookdeck source URL in the provider’s webhook settings.
            Send a test event and check its delivery before switching production
            traffic.
          </p>
        </li>
      </ol>
      <a
        className="experience-primary setup-cta"
        href="https://dashboard.hookdeck.com"
        target="_blank"
        rel="noreferrer"
      >
        Open Hookdeck <ArrowUpRight size={16} />
      </a>
      <p className="setting-hint">
        This playground hasn’t created a connection or changed your services.
      </p>
    </>
  );
}
