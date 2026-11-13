import { Icon, icons } from "../Icon.jsx";

// Split layout for the sign-in / create-account screens:
// a branded NVRI panel on the left, the form card on the right.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth-shell">
      <section className="auth-brand" aria-hidden="true">
        <div className="auth-brand-inner">
          <div className="brand-mark lg">
            <Icon d={icons.shield} size={30} strokeWidth={2} />
          </div>
          <div className="auth-brand-name">
            VERIFY<span>AI</span>
          </div>
          <p className="auth-brand-tag">Results verification for the National Veterinary Research Institute, Vom.</p>

          <ul className="auth-points">
            <li>
              <Icon d={icons.check} size={16} /> AI-assisted completeness and duplicate checks
            </li>
            <li>
              <Icon d={icons.check} size={16} /> Human review decisions with a full audit trail
            </li>
            <li>
              <Icon d={icons.check} size={16} /> Controlled access for authorised personnel only
            </li>
          </ul>

          <div className="auth-brand-foot">NVRI · Vom &nbsp;·&nbsp; Est. 1924</div>
        </div>
      </section>

      <main className="auth-panel">
        <div className="auth-card">
          <h1>{title}</h1>
          <p className="auth-sub">{subtitle}</p>

          {children}

          <div className="auth-switch">{footer}</div>
        </div>
      </main>
    </div>
  );
}
