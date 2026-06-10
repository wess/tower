import { get, halt, head, pipe, putHeader, stream, text } from "@atlas/server"

const TARGETS = new Set(["wess-linux-x64", "wess-darwin-arm64", "wess-darwin-x64"])

const INSTALL = `#!/bin/sh
# wess.dev CLI installer — curl -fsSL https://wess.dev/install.sh | sh
set -e

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)  target="wess-linux-x64" ;;
  Darwin-arm64)  target="wess-darwin-arm64" ;;
  Darwin-x86_64) target="wess-darwin-x64" ;;
  *) echo "unsupported platform: $(uname -s) $(uname -m)"; exit 1 ;;
esac

dir="\${WESS_INSTALL:-/usr/local/bin}"
[ -w "$dir" ] || dir="$HOME/.local/bin"
mkdir -p "$dir"

echo "downloading $target → $dir/wess"
curl -fL "https://wess.dev/dl/$target" -o "$dir/wess"
chmod +x "$dir/wess"

echo ""
echo "✓ installed: $dir/wess"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "  add it to your PATH: export PATH=\\"$dir:\\$PATH\\"" ;;
esac
echo "  get started: wess login"
`

async function artifactHeaders(c: Parameters<typeof putHeader>[0], name: string) {
  if (!TARGETS.has(name)) return null
  const file = Bun.file(`${process.cwd()}/public/dl/${name}`)
  if (!(await file.exists())) return null
  let out = putHeader(c, "content-type", "application/octet-stream")
  out = putHeader(out, "content-length", String(file.size))
  out = putHeader(out, "content-disposition", `attachment; filename="wess"`)
  return { out, file }
}

export const dlRoutes = [
  get("/install.sh", pipe((c) => text(c, 200, INSTALL))),

  get(
    "/dl/:file",
    pipe(async (c) => {
      const hit = await artifactHeaders(c, c.params.file)
      if (!hit) return halt(c, 404, "unknown artifact")
      return stream(hit.out, 200, hit.file.stream())
    }),
  ),

  // uptime checks and download tooling probe with HEAD
  head(
    "/dl/:file",
    pipe(async (c) => {
      const hit = await artifactHeaders(c, c.params.file)
      if (!hit) return halt(c, 404, "unknown artifact")
      return { ...hit.out, status: 200, halted: true }
    }),
  ),
]
