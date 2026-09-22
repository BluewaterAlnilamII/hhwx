import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/components/bandori/BandoriHelpPopover.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
});

// Exercise the shared handlers without mounting the authenticated team builder.
test("search and info help preserve hover, pin, dismissal, and accessible names", () => {
  for (const variant of ["search", "info"]) {
    let open = false, refIndex = 0, effect;
    const refs = [], listeners = new Map();
    const exports = {};
    const jsx = (type, props) => ({ type, props });
    runInNewContext(outputText, {
      exports,
      document: { activeElement: null },
      window: {
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener: (name) => listeners.delete(name),
      },
      require: (name) => {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "react") return {
          useId: () => "help-id",
          useRef: (initial) => refs[refIndex++] ??= { current: initial },
          useState: () => [open, (value) => { open = value; }],
          useEffect: (callback) => { effect = callback; },
          useLayoutEffect() {},
        };
        if (name === "lucide-react") return { Info: "info-icon" };
        if (name.endsWith("BandoriCardHoverTooltip")) return {};
        throw new Error(`Unexpected import: ${name}`);
      },
    });
    const render = () => {
      refIndex = 0;
      const tree = exports.default({
        label: "Lineup help", title: variant === "search" ? "Examples" : undefined,
        variant, children: "Use this order",
      });
      return tree.props.children.map((node) => node.props);
    };
    const [button, popover] = render();
    const clickButton = () => {
      const dismissFromPointer = open && button.popoverTarget !== popover.id;
      let defaultPrevented = false;
      button.onClick({ preventDefault() { defaultPrevented = true; } });
      // Native auto-popovers dismiss on outside pointer clicks and otherwise
      // apply the invoker's default toggle after the React click handler.
      if (dismissFromPointer || (!defaultPrevented && button.popoverTarget === popover.id)) {
        popover.onToggle({ newState: "closed" });
      }
    };
    assert.equal(button.type, "button");
    assert.equal(button["aria-label"], "Lineup help");
    assert.equal(button["aria-controls"], popover.id);
    assert.equal(popover.popover, "auto");
    assert.equal(popover.children[1], "Use this order");
    if (variant === "search") {
      assert.equal(button.children.props.children, "?");
      assert.equal(popover["aria-labelledby"], popover.children[0].props.id);
    } else {
      assert.equal(button.children.type, "info-icon");
      assert.equal(popover["aria-label"], "Lineup help");
    }

    button.onPointerEnter({ pointerType: "touch" });
    assert.equal(render()[0]["aria-expanded"], false);
    button.onPointerEnter({ pointerType: "mouse" });
    assert.equal(render()[0]["aria-expanded"], true);
    button.onPointerLeave();
    assert.equal(render()[0]["aria-expanded"], false);

    button.onPointerEnter({ pointerType: "mouse" });
    clickButton();
    button.onPointerLeave();
    assert.equal(render()[0]["aria-expanded"], true, "first click after hover pins help instead of dismissing it");
    clickButton();
    assert.equal(render()[0]["aria-expanded"], false, "second click closes help");

    clickButton();
    popover.onToggle({ newState: "closed" });
    assert.equal(render()[0]["aria-expanded"], false, "native light dismissal resets state");
    clickButton();
    assert.equal(render()[0]["aria-expanded"], true, "help can reopen after light dismissal");
    const cleanup = effect();
    listeners.get("keydown")({ key: "Escape", preventDefault() {}, stopImmediatePropagation() {} });
    assert.equal(render()[0]["aria-expanded"], false);
    cleanup();
    assert.equal(listeners.size, 0);
  }
});
