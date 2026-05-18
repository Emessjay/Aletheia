import { Navigate, useParams } from "react-router-dom";
import { useWorkSections } from "@/db/hooks";

/** /patristics/:work — load the work's section list and redirect into the
 *  first section. We can't hard-code section URLs in the index because the
 *  section identifier varies per work and computing it requires a per-work
 *  DB query; doing 200+ queries up-front would be wasteful, so the index
 *  links to /patristics/:work and this redirect resolves on demand. */
export function PatristicsWorkRedirect() {
  const { work = "" } = useParams();
  const sections = useWorkSections(work, "en");
  if (sections.isPending) {
    return <p style={{ padding: "2rem", color: "var(--color-fg-muted)" }}>Loading…</p>;
  }
  const first = sections.data?.[0];
  if (!first) {
    return (
      <p style={{ padding: "2rem", color: "var(--color-fg-muted)" }}>
        No sections found for this work.
      </p>
    );
  }
  return (
    <Navigate
      to={`/patristics/${work}/${encodeURIComponent(first.ordinal_path)}`}
      replace
    />
  );
}
