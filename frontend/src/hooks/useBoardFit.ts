import { useCallback, useEffect, useState } from "react";

/** Below this width the board and its panel stack, and the page scrolls again. */
const STACK_BELOW = 1024;
/** The board carries an 8px hard offset shadow; without this it gets clipped
 *  by the bottom of the frame, which is the one place the design system
 *  actually shows its depth. */
const SHADOW_ALLOWANCE = 14;
/** Never shrink the board past this — below it the pieces stop being readable. */
const MIN_BOARD = 260;

/**
 * Sizes a square board to fill the row it sits in, leaving `reserved` px for the
 * panel beside it.
 *
 * react-chessboard needs an explicit pixel `boardWidth`: it measures its parent
 * exactly once, has no resize observer, and otherwise falls back to a hardcoded
 * 560px — which is how the review board used to spill over the panel next to it.
 *
 * Attach `ref` to the row that holds both the board and the panel. The observer
 * watches that row, so the board follows window resizes, sidebar changes and
 * anything else that moves the layout, with no magic offsets for the navbar or
 * page padding.
 */
export default function useBoardFit(reserved: number) {
  // A callback ref, not useRef: pages that return a loading state first only
  // mount the row later, and a plain ref would still be null when the effect
  // ran — leaving the observer unattached and the board stuck at MIN_BOARD.
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => setNode(el), []);
  const [size, setSize] = useState(MIN_BOARD);
  const [stacked, setStacked] = useState(
    () => typeof window !== "undefined" && window.innerWidth < STACK_BELOW,
  );

  useEffect(() => {
    const el = node;
    if (!el) return undefined;

    const measure = () => {
      const narrow = window.innerWidth < STACK_BELOW;
      setStacked(narrow);
      const { width, height } = el.getBoundingClientRect();
      // The board is square, so the tighter axis wins. Stacked, the panel drops
      // below it and the full width is available.
      const usable = narrow ? width : Math.min(height - SHADOW_ALLOWANCE, width - reserved);
      setSize(Math.max(MIN_BOARD, Math.floor(usable)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [node, reserved]);

  return { ref, size, stacked };
}
