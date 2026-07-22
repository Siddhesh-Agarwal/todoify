import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { KeybindingCheatSheet } from "./keybinding-cheat-sheet";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <HotkeysProvider>{children}</HotkeysProvider>;
}

describe("KeybindingCheatSheet", () => {
  it("renders nothing when closed", () => {
    render(<KeybindingCheatSheet open={false} onClose={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.queryByText("[ KEYBINDINGS ]")).toBeNull();
  });

  it("renders the cheat sheet when open", () => {
    render(<KeybindingCheatSheet open={true} onClose={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByText("[ KEYBINDINGS ]")).toBeTruthy();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<KeybindingCheatSheet open={true} onClose={onClose} />, { wrapper: Wrapper });
    const backdrop = screen.getByText("[ KEYBINDINGS ]").closest(".fixed")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the panel", () => {
    const onClose = vi.fn();
    render(<KeybindingCheatSheet open={true} onClose={onClose} />, { wrapper: Wrapper });
    const panel = screen.getByText("[ KEYBINDINGS ]").parentElement!;
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });
});
