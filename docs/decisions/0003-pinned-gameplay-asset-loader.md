# Decision 0003: Pinned gameplay asset loader foundation

- Status: Accepted
- Date: 2026-09-03

## Context

The approved cross-engine gameplay release is `aerobeat-asset-gameplay` `0.0.3` at commit `8b8b40593b9deb54d32654e39fd7c1c1c4a9dc1a`. The renderer needs package-local PlayCanvas containers before semantic visual replacement can land, without making the asset repository a runtime dependency or permitting stale asynchronous work to cross lifecycle boundaries.

## Decision

Keep the asset repository canonical. Track a deterministic renderer sync/verify script which accepts only the pinned source commit, exact 17-file release inventory, raw tree `aa37bf534cc592a4057127876d567eadc3496f49`, inventory SHA-256 `69b88d38113a56061dfc0ea5e92ec51a0b181fcade6a99e1dcc5df1baecdde03`, proof SHA-256 `287adc43a0456782044f0fd7601efd7b5087342972d9da4525923598754b1efc`, and every inventory byte count/hash. Package that release unchanged under `assets/gameplay/0.0.3/`. The arrow is fully opaque with a runtime-tintable core and structural white rim; the authored track body uses alpha `0.52`.

Expose frozen normalized set and asset identities plus URLs resolved relative to the installed module. Fetch only those seven package-local URLs, verify bytes and SHA-256 before constructing PlayCanvas container assets, and keep every loader generation bound to one application. Abort fetches and reject stale parser completion on detach, destroy, replacement, and context loss. Context restoration creates a fresh generation.

Diagnostics use explicit `idle`, `loading`, `ready`, `error`, `fallback`, and `disposed` states. Existing renderer geometry remains the bounded development/error fallback in this foundation slice; no semantic target mapping changes here. A caller-owned render promotes a preload error to explicit fallback readiness.

The GLBs intentionally omit stored normal attributes. PlayCanvas 2.21.4's GLB parser generates normals when `SEMANTIC_NORMAL` is absent, and browser validation must parse all seven containers successfully. No substitute geometry is introduced for this condition.

## Consequences

- Installed packages contain the exact approved runtime payload but no `.blend`, review render, old release, or asset tooling.
- Instances own independent container resources and do not share completion state.
- Container loading adds no RAF and no URLs beyond packaged local assets.
- Gameplay visuals remain unchanged until the separately tracked semantic-rendering slice.
