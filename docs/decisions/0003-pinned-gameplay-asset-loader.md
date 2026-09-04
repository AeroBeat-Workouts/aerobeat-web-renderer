# Decision 0003: Pinned gameplay asset loader foundation

- Status: Accepted
- Date: 2026-09-03

## Context

The approved cross-engine gameplay release is `aerobeat-asset-gameplay` `0.0.5` at exact creator commit `2bd4712f00dd65a758aa064d0e709131f8af8c64` and source tree `b2336c6ebe8a90a49ee5beb3024e79bfaa078613`. It succeeds `0.0.4` by re-authoring only `wall/red-glass-v1` to an exact `0.94 × 0.94 × 1.00` source footprint while keeping the other six GLBs byte-identical, including the non-coplanar styled `+Z`/`−Z` OPAQUE arrow fix. The renderer needs package-local PlayCanvas containers without making the asset repository a runtime dependency or permitting stale asynchronous work to cross lifecycle boundaries.

## Decision

Keep the asset repository canonical. Track a deterministic renderer sync/verify script which accepts only a fully clean source worktree whose current `HEAD` equals the pinned creator commit and whose complete source tree is exact, plus the exact 17-file release inventory, raw tree `000653eace4b93f3c5d2eef11bd5c8255008b3de`, inventory SHA-256 `4984cca24b8121bc6657153304726f1f7ef05d878ca5220f3c3e2b6f2457a102`, proof SHA-256 `4aac2274a9803a05e9ff533c02958cf1c5def66e0af1bf2fae3cc4479319f350`, set SHA-256 `b5d50f1dff440b687c017f96b2bc0f06f5afdcd5e2a00522511f3803b4ec7ed2`, and every inventory byte count/hash. Package that release unchanged as the sole `assets/gameplay/0.0.5/` tree. The `3,692`-byte wall GLB is SHA-256 `1227bfbb7d5379b33f1468c1a0d7fffad07c9390654b54033f079ba602a84a37`, exactly matches the visible `0.94 × 0.94` cell at unit X/Y scale, retains a `0.06` gap on `1.0` pitch, and remains Z-only interval-scaled. The `3,832`-byte arrow GLB remains SHA-256 `1a1ffd53d02e07da8ba098e940d3a53d0041d1e865fe9a9682b19c721bccf513`, fully opaque, and styled on both camera-accessible faces; the authored track body retains alpha `0.52`.

Expose frozen normalized set and asset identities plus URLs resolved relative to the installed module. Fetch only those seven package-local URLs, verify bytes and SHA-256 before constructing PlayCanvas container assets, and keep every loader generation bound to one application. Abort fetches and reject stale parser completion on detach, destroy, replacement, and context loss. Context restoration creates a fresh generation.

Diagnostics use explicit `idle`, `loading`, `ready`, `error`, `fallback`, and `disposed` states. Existing renderer geometry remains the bounded development/error fallback in this foundation slice; no semantic target mapping changes here. A caller-owned render promotes a preload error to explicit fallback readiness.

The GLBs intentionally omit stored normal attributes. PlayCanvas 2.21.4's GLB parser generates normals when `SEMANTIC_NORMAL` is absent, and browser validation must parse all seven containers successfully. No substitute geometry is introduced for this condition.

## Consequences

- Installed packages contain the exact approved runtime payload but no `.blend`, review render, old release, or asset tooling.
- Instances own independent container resources and do not share completion state.
- Container loading adds no RAF and no URLs beyond packaged local assets.
- Gameplay visuals remain unchanged until the separately tracked semantic-rendering slice.
