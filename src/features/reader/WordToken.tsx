import { useRef } from "react";

interface Props {
  surface: string;
  strongs: string | null;
  lang: string;
  onOpen: (strongsId: string, rect: DOMRect) => void;
}

export function WordToken({ surface, strongs, lang, onOpen }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  if (!strongs) {
    return (
      <span lang={lang}>
        {clean(surface)}
        {" "}
      </span>
    );
  }

  return (
    <>
      <span
        ref={ref}
        lang={lang}
        onClick={() => {
          if (ref.current) onOpen(strongs, ref.current.getBoundingClientRect());
        }}
        style={{
          cursor: "pointer",
          borderBottom: "1px dotted var(--color-rule-strong)",
        }}
      >
        {clean(surface)}
      </span>
      {" "}
    </>
  );
}

// Strip Hebrew morphology slashes (e.g. "בְּ/רֵאשִׁית" → display "בְּרֵאשִׁית").
function clean(s: string): string {
  return s.replace(/\\/g, "").replace(/\//g, "");
}
