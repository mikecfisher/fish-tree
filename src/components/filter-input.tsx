import { useAppState } from "../state/store.ts";

export function FilterInput() {
  const { state, dispatch } = useAppState();

  return (
    <box flexDirection="row" height={1} width="100%">
      <text fg="#61AFEF">{"Search: "}</text>
      <input
        focused
        value={state.filterText}
        placeholder="type to filter..."
        onInput={(value: string) => {
          dispatch({ type: "SET_FILTER", text: value });
        }}
        onSubmit={() => {
          // Select the first matching worktree
          const firstWorktree = state.filteredItems.find(
            (item) => item.type === "worktree",
          );
          if (firstWorktree) {
            dispatch({ type: "SELECT_WORKTREE" });
          }
        }}
        flexGrow={1}
      />
      <text fg="#6b7280">{` ${state.filteredItems.filter((i) => i.type === "worktree").length} matches`}</text>
    </box>
  );
}
