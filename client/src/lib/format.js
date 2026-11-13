// Shared formatting helpers.

export const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const statusClass = (status) => {
  if (status === "Verified") return "badge-verified";
  if (status === "Escalated") return "badge-escalated";
  return "badge-pending";
};

// Up to two initials from a display name ("Adaeze Okafor" -> "AO").
export const initials = (name) => {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "??";
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
};
