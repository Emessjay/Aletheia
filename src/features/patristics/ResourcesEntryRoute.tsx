import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { usePatristicWorks, useWorkSectionOutline } from "@/db/hooks";
import {
  isPackInstalled,
  useCorpusPacks,
} from "@/db/useCorpusPacks";
import {
  RESOURCES_BASE,
  isResourcesCorpusId,
  resourcesCorpusMeta,
  workMatchesCorpus,
  type ResourcesCorpusId,
} from "@/domain/resourcesCorpora";
import { WorksByAuthor } from "./worksByAuthor";

/**
 * /resources/:slug — either a pack-gated category (anf | npnf | reformers |
 * base) or a work slug that redirects into its first section.
 */
export function ResourcesEntryRoute() {
  const { slug = "" } = useParams();
  if (!slug) return <Navigate to={RESOURCES_BASE} replace />;
  if (isResourcesCorpusId(slug)) {
    return <CategoryView corpusId={slug} />;
  }
  return <WorkRedirect work={slug} />;
}

function CategoryView({ corpusId }: { corpusId: ResourcesCorpusId }) {
  const meta = resourcesCorpusMeta(corpusId)!;
  const packs = useCorpusPacks();
  const works = usePatristicWorks();

  const installed = isPackInstalled(packs.data, meta.packId);
  const filtered = useMemo(
    () => (works.data ?? []).filter((w) => workMatchesCorpus(w.slug, corpusId)),
    [works.data, corpusId],
  );

  return (
    <article style={wrap}>
      <header style={{ marginBottom: "2rem" }}>
        <p className="al-eyebrow">
          <Link to={RESOURCES_BASE} style={crumbLink}>
            ← Resources
          </Link>
        </p>
        <h1
          style={{
            fontSize: 28,
            fontStyle: "italic",
            marginTop: 4,
          }}
        >
          {meta.title}
        </h1>
        <p style={{ color: "var(--color-fg-muted)", marginTop: 8 }}>
          {meta.description}
        </p>
      </header>

      {packs.isPending || works.isPending ? (
        <p style={{ color: "var(--color-fg-muted)" }}>Loading…</p>
      ) : packs.isError ? (
        <pre style={{ color: "var(--color-accent)" }}>{String(packs.error)}</pre>
      ) : works.isError ? (
        <pre style={{ color: "var(--color-accent)" }}>{String(works.error)}</pre>
      ) : !installed ? (
        <p style={{ color: "var(--color-fg-muted)" }}>
          This pack is not installed. Install it from Settings → Content packs
          (dev builds ship every pack automatically).
        </p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--color-fg-muted)" }}>
          No writings found for this category.
        </p>
      ) : (
        <WorksByAuthor works={filtered} />
      )}
    </article>
  );
}

function WorkRedirect({ work }: { work: string }) {
  const sections = useWorkSectionOutline(work, "en");

  if (sections.isPending) {
    return (
      <p style={{ padding: "2rem", color: "var(--color-fg-muted)" }}>
        Loading…
      </p>
    );
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
      to={`${RESOURCES_BASE}/${work}/${encodeURIComponent(first.ordinal_path)}`}
      replace
    />
  );
}

const wrap: React.CSSProperties = {
  maxWidth: "var(--measure)",
  margin: "0 auto",
  padding: "2.5rem 2rem 6rem",
};

const crumbLink: React.CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};
