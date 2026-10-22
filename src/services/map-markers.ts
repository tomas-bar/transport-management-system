import type { VisitTask } from "../domain/route-plan";

const user =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/></svg>';
const parcel =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 7 9-5 9 5v10l-9 5-9-5Z"/><path d="m3 7 9 5 9-5M12 12v10M7 4l9 5"/></svg>';
/** HTML contains only generated numbers, fixed icons and enum-derived classes. */
export function markerContent(
  numbers: number[],
  tasks: VisitTask[],
  completed: boolean,
  compact: boolean,
) {
  const kinds = [...new Set(tasks.map((t) => t.kind))];
  const flags = [...new Set(tasks.map((t) => `${t.type}:${t.kind}`))];
  const direction = kinds.length > 1 ? "mixed" : (kinds[0] ?? "route");
  const icons = compact
    ? ""
    : flags
        .map((flag) => {
          const [type, kind] = flag.split(":");
          return `<span class="map-task-flag ${kind}">${type === "passenger" ? user : parcel}<b>${kind === "pickup" ? "↑" : "↓"}</b></span>`;
        })
        .join("");
  const width =
    Math.max(30, numbers.join(", ").length * 7 + 18) +
    (compact ? 0 : flags.length * 26);
  return {
    width,
    html: `<span class="task-marker ${direction} ${completed ? "is-complete" : ""}" style="width:${width}px"><b class="marker-number">${numbers.join(", ")}</b>${icons}${completed ? '<i class="marker-done">✓</i>' : ""}</span>`,
  };
}
