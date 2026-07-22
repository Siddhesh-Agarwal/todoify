import { useHotkey, useHotkeyRegistrations } from "@tanstack/react-hotkeys";

declare module "@tanstack/react-hotkeys" {
  interface HotkeyMeta {
    group?: string;
  }
}

interface KeybindingCheatSheetProps {
  open: boolean;
  onClose: () => void;
}

const GROUPS = [
  { id: "task", label: "TASK" },
  { id: "navigation", label: "NAVIGATION" },
  { id: "view", label: "VIEW" },
  { id: "multi-select", label: "MULTI-SELECT" },
  { id: "system", label: "SYSTEM" },
] as const;

type GroupId = (typeof GROUPS)[number]["id"];

function groupHotkeys(
  hotkeys: ReturnType<typeof useHotkeyRegistrations>["hotkeys"],
): Map<GroupId, typeof hotkeys> {
  const grouped = new Map<GroupId, typeof hotkeys>();
  for (const g of GROUPS) grouped.set(g.id, []);
  for (const hk of hotkeys) {
    const group = (hk.options.meta?.group as GroupId) ?? "system";
    const arr = grouped.get(group);
    if (arr) arr.push(hk);
  }
  return grouped;
}

function formatKey(hotkey: string): string {
  return hotkey
    .replace(/Mod\+/g, "⌘/")
    .replace(/Control\+/g, "Ctrl+")
    .replace(/Meta\+/g, "⌘+");
}

export function KeybindingCheatSheet({ open, onClose }: KeybindingCheatSheetProps) {
  const { hotkeys, sequences } = useHotkeyRegistrations();

  useHotkey({ key: "/", shift: true }, () => {
    if (open) onClose();
  }, { ignoreInputs: false });

  if (!open) return null;

  const grouped = groupHotkeys(hotkeys);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        className="border border-border bg-background p-6 shadow-[0_0_40px_rgba(230,25,25,0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-foreground">
            [ KEYBINDINGS ]
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground"
          >
            ESC TO CLOSE
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {GROUPS.map((group) => {
            const items = grouped.get(group.id) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={group.id} className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  // {group.label}
                </span>
                {items.map((hk) => (
                  <div key={hk.hotkey} className="flex items-center gap-3">
                    <kbd className="min-w-[80px] border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-accent">
                      {formatKey(hk.hotkey)}
                    </kbd>
                    <span className="font-mono text-[10px] uppercase tracking-[0.03em] text-muted-foreground">
                      {hk.options.meta?.name ?? hk.hotkey}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}

          {sequences.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                // SEQUENCES
              </span>
              {sequences.map((seq) => (
                <div key={seq.sequence.join(" ")} className="flex items-center gap-3">
                  <kbd className="min-w-[80px] border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-accent">
                    {seq.sequence.join(" → ")}
                  </kbd>
                  <span className="font-mono text-[10px] uppercase tracking-[0.03em] text-muted-foreground">
                    {seq.options.meta?.name ?? seq.sequence.join(" ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground/60">
            {hotkeys.length} shortcuts · {sequences.length} sequences
          </span>
        </div>
      </div>
    </div>
  );
}
