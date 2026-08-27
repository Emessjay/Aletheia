import { Navigate, useParams } from "react-router-dom";
import { RESOURCES_BASE } from "@/domain/resourcesCorpora";

/** Legacy /patristics/* bookmarks → /resources/*. */
export function PatristicsPathRedirect() {
  const { work, section } = useParams();
  if (work && section) {
    return (
      <Navigate
        to={`${RESOURCES_BASE}/${work}/${encodeURIComponent(section)}`}
        replace
      />
    );
  }
  if (work) {
    return <Navigate to={`${RESOURCES_BASE}/${work}`} replace />;
  }
  return <Navigate to={RESOURCES_BASE} replace />;
}
