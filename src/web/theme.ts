// Nord palette (nordtheme.com) — shared design tokens for every surface.
// Polar Night (backgrounds) · Snow Storm (text) · Frost (accents) · Aurora (status).

export const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,900;1,9..144,600&family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>`

export const NORD = {
  n0: "#2e3440",
  n1: "#3b4252",
  n2: "#434c5e",
  n3: "#4c566a",
  n4: "#d8dee9",
  n5: "#e5e9f0",
  n6: "#eceff4",
  frost1: "#8fbcbb",
  frost2: "#88c0d0",
  frost3: "#81a1c1",
  frost4: "#5e81ac",
  red: "#bf616a",
  orange: "#d08770",
  yellow: "#ebcb8b",
  green: "#a3be8c",
  purple: "#b48ead",
}

// CSS variables. Old names (--paper/--ink/--line/--accent…) are aliased to Nord
// values so existing markup recolors without rewrites; new code uses the clean
// names (--bg/--fg/--accent/…).
export const themeVars = `
  --bg:#2e3440; --paper:#2e3440; --bg-1:#3b4252; --paper-2:#3b4252; --bg-2:#434c5e; --bg-3:#4c566a;
  --fg:#eceff4; --ink:#eceff4; --fg-1:#e5e9f0; --fg-2:#d8dee9; --ink-soft:#d8dee9; --muted:#94a1b8;
  --line:#3b4252; --line-2:#434c5e;
  --accent:#88c0d0; --accent-2:#81a1c1; --accent-deep:#5e81ac; --accent-soft:rgba(136,192,208,.14); --teal:#8fbcbb;
  --green:#a3be8c; --yellow:#ebcb8b; --red:#bf616a; --orange:#d08770; --purple:#b48ead;
  --on-accent:#2e3440;
  --sans:"Archivo",system-ui,-apple-system,sans-serif; --serif:"Fraunces",Georgia,serif; --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
`

// Base resets + shared component styles (scrollbars, selection, buttons,
// inputs, code) used across pages. Page-specific layout CSS is appended per page.
export const baseCss = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--fg);font-family:var(--sans);-webkit-font-smoothing:antialiased}
  a{color:var(--accent);text-decoration:none} ::selection{background:rgba(136,192,208,.3);color:var(--fg)}
  code,.mono{font-family:var(--mono)}
  ::-webkit-scrollbar{width:11px;height:11px} ::-webkit-scrollbar-track{background:var(--bg)}
  ::-webkit-scrollbar-thumb{background:var(--bg-3);border:3px solid var(--bg);border-radius:7px}
  ::-webkit-scrollbar-thumb:hover{background:#5a657c}
`
