// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { KeybindingCheatSheet } from "./keybinding-cheat-sheet";

vi.mock("@tanstack/react-hotkeys", () => ({
  useHotkeyRegistrations: () => ({ hotkeys: [], sequences: [] }),
  useHotkey: vi.fn(),
  HotkeysProvider: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(() => {
  cleanup();
});

describe("KeybindingCheatSheet", () => {
  it("renders nothing when closed", () => {
    render(<KeybindingCheatSheet open={false} onToggle={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText("[ KEYBINDINGS ]")).toBeNull();
  });

  it("renders the cheat sheet when open", () => {
    render(<KeybindingCheatSheet open={true} onToggle={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("[ KEYBINDINGS ]")).toBeTruthy();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<KeybindingCheatSheet open={true} onToggle={vi.fn()} onClose={onClose} />);
    const backdrop = screen.getByText("[ KEYBINDINGS ]").closest(".fixed")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the panel", () => {
    const onClose = vi.fn();
    render(<KeybindingCheatSheet open={true} onToggle={vi.fn()} onClose={onClose} />);
    const panel = screen.getByText("[ KEYBINDINGS ]").parentElement!;
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });
});
