# Decision 0003: Pinned gameplay asset loader foundation

- Status: Accepted
- Date: 2026-09-03

## Context

The approved cross-engine gameplay release is `aerobeat-asset-gameplay` `0.0.4` at commit `32e0fc71c55f999a1fb16abf73dcb768b8294b3a`. It succeeds `0.0.3` with non-coplanar, styled `+Z` and `−Z` arrow faces while retaining OPAQUE/depth-test/depth-write truth and no renderer Y flip. The renderer needs package-local PlayCanvas containers without making the asset repository a runtime dependency or permitting stale asynchronous work to cross lifecycle boundaries.

## Decision

Keep the asset repository canonical. Track a deterministic renderer sync/verify script which accepts only the pinned source commit, exact 17-file release inventory, raw tree `be36bbd03647bfb4654e0be1ed8b3f6446ced4ec`, inventory SHA-256 `efecf985fd1bc1024c9ffcb64faf92b76f3492df4f8ffa10e53277d5bac18698`, proof SHA-256 `c1916a14d90aef230747185ed823c17bcae0e91229929595599f1bd3aee6e97b`, set SHA-256 `412092d4e9b8ee8069865ec95b9649929027b8e703e8a71a8e8ab5953089a0e3`, and every inventory byte count/hash. Package that release unchanged under `assets/gameplay/0.0.4/`. The `3,832`-byte arrow GLB is SHA-256 `1a1ffd53d02e07da8ba098e940d3a53d0041d1e865fe9a9682b19c721bccf513`, fully opaque, and styled on both camera-accessible faces; the authored track body uses alpha `0.52`.

Expose frozen normalized set and asset identities plus URLs resolved relative to the installed module. Fetch only those seven package-local URLs, verify bytes and SHA-256 before constructing PlayCanvas container assets, and keep every loader generation bound to one application. Abort fetches and reject stale parser completion on detach, destroy, replacement, and context loss. Context restoration creates a fresh generation.

Diagnostics use explicit `idle`, `loading`, `ready`, `error`, `fallback`, and `disposed` states. Existing renderer geometry remains the bounded development/error fallback in this foundation slice; no semantic target mapping changes here. A caller-owned render promotes a preload error to explicit fallback readiness.

The GLBs intentionally omit stored normal attributes. PlayCanvas 2.21.4's GLB parser generates normals when `SEMANTIC_NORMAL` is absent, and browser validation must parse all seven containers successfully. No substitute geometry is introduced for this condition.

## Consequences

- Installed packages contain the exact approved runtime payload but no `.blend`, review render, old release, or asset tooling.
- Instances own independent container resources and do not share completion state.
- Container loading adds no RAF and no URLs beyond packaged local assets.
- Gameplay visuals remain unchanged until the separately tracked semantic-rendering slice.
