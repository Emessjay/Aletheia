import { Link } from "react-router-dom";
import {
  isPackInstalled,
  useCorpusPacks,
} from "@/db/useCorpusPacks";
import {
  RESOURCES_BASE,
  RESOURCES_CORPORA,
  type ResourcesCorpusMeta,
} from "@/domain/resourcesCorpora";

/** /resources — pack-gated category picker for classical writings. */
export function PatristicsIndexRoute() {
  const packs = useCorpusPacks();
  const visible = RESOURCES_CORPORA.filter((c) =>
    isPackInstalled(packs.data, c.packId),
  );

  return (
    <article style={wrap}>
      <header style={{ marginBottom: "2rem" }}>
        <p className="al-eyebrow">Resources</p>
        <h1
          style={{
            fontSize: 28,
            fontStyle: "italic",
            marginTop: 4,
          }}
        >
          Classical writings
        </h1>
      </header>

      {packs.isPending ? (
        <p style={{ color: "var(--color-fg-muted)" }}>Loading…</p>
      ) : packs.isError ? (
        <pre style={{ color: "var(--color-accent)" }}>{String(packs.error)}</pre>
      ) : visible.length === 0 ? (
        <p style={{ color: "var(--color-fg-muted)" }}>
          No resource packs are installed. Install Ante-Nicene Fathers, Nicene
          and Post-Nicene Fathers, or Reformers from Settings → Content packs
          (Summa &amp; Creeds ship with the base corpus on desktop).
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {visible.map((c) => (
            <CategoryRow key={c.id} corpus={c} />
          ))}
        </ul>
      )}
    </article>
  );
}

function CategoryRow({ corpus }: { corpus: ResourcesCorpusMeta }) {
  return (
    <li style={rowItem}>
      <Link to={`${RESOURCES_BASE}/${corpus.id}`} style={linkReset}>
        <h2 style={categoryTitle}>{corpus.title}</h2>
        <p style={metaLine}>{corpus.description}</p>
      </Link>
    </li>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: "var(--measure)",
  margin: "0 auto",
  padding: "2.5rem 2rem 6rem",
};

const rowItem: React.CSSProperties = {
  padding: "1rem 0",
  borderBottom: "1px solid var(--color-rule)",
};

const linkReset: React.CSSProperties = {
  color: "inherit",
  textDecoration: "none",
  display: "block",
};

const categoryTitle: React.CSSProperties = {
  fontSize: 20,
  fontStyle: "italic",
  fontWeight: 400,
  margin: 0,
};

const metaLine: React.CSSProperties = {
  margin: "0.25rem 0 0",
  color: "var(--color-fg-muted)",
  fontSize: 14,
};
