import { useOutletContext } from "react-router-dom";
import { Notice } from "../components/Notice.jsx";

const CARDS = [
  {
    title: "User and access management",
    body: "Role-based access control must be configured and tested before real result data is entered.",
    badge: "Setup required",
    tone: "amber",
  },
  {
    title: "Data protection",
    body: "Agree approved data fields, retention, deletion, encryption, backups and hosting with the institution.",
    badge: "Setup required",
    tone: "amber",
  },
  {
    title: "Verification rules",
    body: "Confirm source documents, permitted checks, escalation rules and final approval authority.",
    badge: "To confirm",
    tone: "blue",
  },
];

function SettingRow({ title, body, badge, tone }) {
  return (
    <div className="panel settings-card">
      <div className="settings-body">
        <h3>{title}</h3>
        <p className="muted">{body}</p>
      </div>
      <span className={`badge badge-${tone}`}>{badge}</span>
    </div>
  );
}

export default function Settings() {
  const { serviceOk } = useOutletContext();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">CONFIGURATION</div>
          <h1>Workspace settings</h1>
          <p className="lede">Workspace configuration and operating principles.</p>
        </div>
      </div>

      <div className="settings-list">
        {CARDS.map((c) => (
          <SettingRow key={c.title} {...c} />
        ))}

        <div className="panel settings-card">
          <div className="settings-body">
            <h3>Service status</h3>
            <p className="muted">{serviceOk ? "Backend API is responding." : "Backend API is not responding."}</p>
          </div>
          <span className={`badge ${serviceOk ? "badge-verified" : "badge-escalated"}`}>
            {serviceOk ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      <Notice title="Before entering real candidate data">
        Confirm institutional approval, authentication, permissions, security controls and retention policies before
        entering real or sensitive candidate results.
      </Notice>
    </>
  );
}
