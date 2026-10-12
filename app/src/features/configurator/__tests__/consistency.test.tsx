// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import { COLOR } from "@/domain/catalogue/data";
import { SchematicDoor } from "@/features/preview/SchematicDoor";
import { OptionPanel } from "../OptionPanel";
import { SummaryPanel } from "../SummaryPanel";
import { ConfiguratorProvider, useConfigurator, type ConfiguratorApi } from "../store";

/** The latest context value, captured after each commit so tests can read state and call actions. */
let api: ConfiguratorApi;
function Capture() {
  const c = useConfigurator();
  useEffect(() => { api = c; });
  return null;
}
function Preview() {
  return <SchematicDoor selections={useConfigurator().selections} view="exterior" />;
}
function Harness() {
  return (
    <>
      <Capture />
      <OptionPanel />
      <div data-testid="summary"><SummaryPanel onSave={() => {}} onShare={() => {}} /></div>
      <div data-testid="preview"><Preview /></div>
    </>
  );
}

const mount = (source = {}) =>
  render(
    <ToastProvider>
      <ConfiguratorProvider source={source}><Harness /></ConfiguratorProvider>
    </ToastProvider>,
  );

const summaryRow = (name: string) => {
  const dt = within(screen.getByTestId("summary")).getAllByText(name).find((e) => e.tagName === "DT")!;
  return dt.parentElement!.querySelector("dd [data-value]")!.textContent;
};
/** a radio inside a named group, e.g. radio("Door model", /Axis/) — group names repeat across the panel */
const radio = (group: string | RegExp, name: string | RegExp) =>
  within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name });
const go = (n: number) => act(() => api.goStep(n));
const activeProduct = () => screen.getByTestId("active-product").textContent;

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("every component reflects the same active configuration", () => {
  it("selecting a door updates the product everywhere: panel, picker, summary and preview", async () => {
    mount();
    await waitFor(() => expect(api.ready).toBe(true));
    go(1);
    expect(activeProduct()).toMatch(/Haven/);
    expect(radio("Door model", /Haven/)).toHaveProperty("ariaChecked", "true");

    fireEvent.click(radio("Door model", /Meridian/));

    expect(api.selections.product).toBe("meridian");
    expect(activeProduct()).toMatch(/Meridian/);
    expect(radio("Door model", /Meridian/).getAttribute("aria-checked")).toBe("true");
    expect(radio("Door model", /Haven/).getAttribute("aria-checked")).toBe("false");
    expect(summaryRow("Door model")).toBe("Meridian");
    // Haven's navy door is ALSO supported by Meridian, so the user's valid choice is preserved (not reset to Meridian's charcoal default)
    expect(api.selections.colorDoorExt).toBe(COLOR.navy);
    expect(screen.getByTestId("preview").innerHTML).toContain(COLOR.navy);
    expect(screen.getByTestId("preview").innerHTML).not.toContain(COLOR.charcoal);
  });

  it("an option change shows in picker, summary and preview at once", async () => {
    mount();
    await waitFor(() => expect(api.ready).toBe(true));
    go(3);
    fireEvent.click(radio("Door · exterior", "Red"));
    expect(api.selections.colorDoorExt).toBe(COLOR.red);
    expect(radio("Door · exterior", "Red").getAttribute("aria-checked")).toBe("true");
    expect(summaryRow("Door · exterior")).toBe("Red");
    expect(screen.getByTestId("preview").innerHTML).toContain(COLOR.red);
    // the frame follows the door: same state, and its locked row is not listed separately
    expect(api.selections.colorFrameExt).toBe(COLOR.red);
    expect(within(screen.getByTestId("summary")).queryByText("Frame · exterior")).toBeNull();
  });

  it("unsupported options are disabled with a reason in the UI, and clicking them changes nothing", async () => {
    mount({ preset: "tall-black" }); // Axis
    await waitFor(() => expect(api.ready).toBe(true));
    await waitFor(() => expect(api.selections.product).toBe("axis"));
    go(0);
    const left = radio("Configuration", /^Left sidelite\s*Not/);
    expect(left.getAttribute("aria-disabled")).toBe("true");
    expect(left.textContent).toMatch(/Not available on Axis/);
    const before = api.selections;
    fireEvent.click(left);
    expect(api.selections).toBe(before);
    expect(radio("Configuration", /Single door/).getAttribute("aria-checked")).toBe("true");
  });

  it("switching product shows what it will reset, then resets only that", async () => {
    mount({ preset: "garden-lite" }); // Haven, 3/4 lite, mosaic glass, green
    await waitFor(() => expect(api.selections.glass).toBe("mosaic"));
    go(1);
    const card = radio("Door model", /Axis/);
    expect(card.textContent).toMatch(/Switching will change:/);
    expect(card.textContent).toMatch(/Door glass/);
    const hand = api.selections.hand;
    fireEvent.click(card);
    expect(api.selections.product).toBe("axis");
    expect(api.selections.glass).toBe("linear"); // reset: mosaic not on Axis
    expect(api.selections.hand).toBe(hand); // untouched
    expect(api.selections.lite).toBe("three"); // supported by Axis, kept
  });

  it("undo restores every view of the configuration", async () => {
    mount();
    await waitFor(() => expect(api.ready).toBe(true));
    go(1);
    fireEvent.click(radio("Door model", /Solstice/));
    expect(activeProduct()).toMatch(/Solstice/);
    act(() => api.undo());
    expect(activeProduct()).toMatch(/Haven/);
    expect(summaryRow("Door model")).toBe("Haven");
    act(() => api.redo());
    expect(summaryRow("Door model")).toBe("Solstice");
  });

  it("locked groups explain why, and unlock when the layout allows", async () => {
    mount();
    await waitFor(() => expect(api.ready).toBe(true));
    go(2);
    expect(screen.getByText(/Choose a layout with a transom/)).toBeTruthy();
    act(() => api.select("layout", "transom"));
    expect(screen.queryByText(/Choose a layout with a transom/)).toBeNull();
  });

  it("repeated clicking keeps the UI and state in agreement", async () => {
    mount();
    await waitFor(() => expect(api.ready).toBe(true));
    go(1);
    const names = ["Heritage", "Axis", "Meridian", "Solstice", "Haven", "Axis", "Haven"];
    for (const n of names) {
      fireEvent.click(radio("Door model", new RegExp(n)));
      expect(api.selections.product).toBe(n.toLowerCase());
      expect(summaryRow("Door model")).toBe(n);
      expect(activeProduct()).toMatch(new RegExp(n));
    }
  });
});
