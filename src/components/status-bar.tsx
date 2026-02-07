import { useEffect, useState } from "react";
import { useAppState } from "../state/store.ts";

export function StatusBar() {
  const { state } = useAppState();

  // Auto-clear errors after 5 seconds
  const [visibleError, setVisibleError] = useState<string | null>(null);
  useEffect(() => {
    if (state.error) {
      setVisibleError(state.error);
      const timer = setTimeout(() => setVisibleError(null), 5000);
      return () => clearTimeout(timer);
    }
    setVisibleError(null);
  }, [state.error]);

  const hints = getHints(state.view, !!state.filterText);

  return (
    <box
      height={1}
      width="100%"
      flexDirection="row"
    >
      {visibleError ? (
        <text fg="#ef4444">{` ✗ ${visibleError}`}</text>
      ) : (
        <text fg="#6b7280">{` ${hints}`}</text>
      )}
    </box>
  );
}

function getHints(view: string, isFiltering: boolean): string {
  if (isFiltering) {
    return "↑/↓ navigate  enter select  esc clear";
  }

  switch (view) {
    case "list":
      return "j/k navigate  enter switch  n new  d delete  / search  ? help  q quit";
    case "create":
      return "tab next field  enter create  esc cancel";
    case "confirm-delete":
      return "enter confirm  D force delete  esc cancel";
    case "help":
      return "esc close";
    default:
      return "q quit";
  }
}
