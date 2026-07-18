/**
 * ChessWeb design system — NEO-BRUTALIST STRICT MONOCHROME.
 *
 * Rules (enforced by convention, reviewed in PRs):
 *  - ONLY ink (#0a0a0a), paper (#ececec), white, and Tailwind's `neutral` greys.
 *    No indigo, no green, no red, no yellow. Game states are conveyed with
 *    inversion, outline, weight, and motion — never hue.
 *  - Borders are 3px solid ink. Corners are square (rounded-none everywhere).
 *  - Depth = hard offset shadows (shadow-brutal*), never blur.
 *  - Type: Archivo Black for display, Space Grotesk for UI, Space Mono for
 *    clocks / moves / anything tabular.
 */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0a",
        paper: "#ececec",
      },
      fontFamily: {
        display: ['"Archivo Black"', "sans-serif"],
        body: ['"Space Grotesk"', "sans-serif"],
        mono: ['"Space Mono"', "monospace"],
      },
      boxShadow: {
        "brutal-sm": "3px 3px 0 0 #0a0a0a",
        brutal: "5px 5px 0 0 #0a0a0a",
        "brutal-lg": "8px 8px 0 0 #0a0a0a",
        "brutal-white": "5px 5px 0 0 #ffffff",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "ring-pulse": {
          "0%, 100%": { boxShadow: "inset 0 0 0 4px #0a0a0a" },
          "50%": { boxShadow: "inset 0 0 0 10px #0a0a0a" },
        },
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
      },
      animation: {
        marquee: "marquee 22s linear infinite",
        "ring-pulse": "ring-pulse 1s ease-in-out infinite",
        blink: "blink 1s step-end infinite",
      },
    },
  },
  plugins: [],
};
