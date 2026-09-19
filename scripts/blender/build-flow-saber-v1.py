# 0.0.62 L-C (r2lb) — BUILD SCRIPT: flow-saber-v1 energy blade GLB.
#
# Parametric construction of the 0.0.62 saber visual asset:
#   - a thin tapered 6-sided energy blade along LOCAL +Y (matches the existing
#     orientation math `eulerZ = 90 - atan2(dirY, dirX)` on the old cylinder),
#   - two analytic material slots:
#       mat/saber_core  — bright EMISSIVE inner blade (runtime TINTABLE per hand;
#                         carries the song-palette color),
#       mat/saber_shell — dark near-opaque body with a subtle low-gain emissive
#                         edge tint; reads as a crisp dark blade edge over BOTH
#                         bright Aero and dark Camera backgrounds.
#   - MATERIAL CONSTRAINTS (0.0.61 baseline defect fix, recorded on r2lb):
#       no BLEND_ADDITIVE (additive glow did not dim — freeze-dim was
#       byte-identical on screen). Both slots use OPAQUE normal blend, depth
#       WRITE ON, depth TEST ON. The saber MUST visibly dim: dimmed
#       (alpha 0.45) produces a measurable real-pixel difference.
#   - No runtime textures (GATE 1 decision: tintable per-hand from the song
#     palette; no runtime texture).
#
# Geometry (design constants):
#   - Length 0.75 WU end-to-end — the SAME length as the GATE-1 locked detection
#     capsule (0.75/0.18, equipment-contracts.js). What-you-see-is-what-hits for
#     extent/anchor: the blade extends from the wrist along the direction for
#     exactly 0.75 WU. The TAPER profile is free.
#   - 6-sided polygonal profile, base radius 0.065 WU tapering to a near-point
#     tip (~0.015 WU) over a 6-segment linear taper. Low poly: 64 tris shell +
#     48 tris core = 112 tris total (< 200 target).
#   - The core is an inner blade at ~40% of the shell profile radius, spanning
#     the full 0.75 WU axis so the tinted emission reads as the blade's energy
#     core (not a floating rod).
#
# Reproducibility:
#   `blender -b --python build-flow-saber-v1.py`
#   Output: assets/gameplay/0.0.11/flow-saber/flow-saber-v1.glb
#   Re-run after changing params to regenerate the GLB.
#
# Usage:
#   blender -b --python scripts/blender/build-flow-saber-v1.py
#   (no .blend input; the script builds the blade procedurally and exports a
#    fresh GLB. The .blend source is NOT committed — the build script is the
#    authoritative generator, mirroring the aerobeat-gameplay-generator-v9
#    convention used by the other 7 pinned assets.)

import math
import sys
from pathlib import Path

import bpy

# ── Design constants (GATE-1 locked length; taper free) ────────────────────
BLADE_LENGTH = 0.75          # WU end-to-end (== detection capsule length)
SHELL_BASE_RADIUS = 0.065    # WU base radius of the outer shell
SHELL_TIP_RADIUS = 0.015     # WU near-point tip radius
SHELL_SIDES = 6              # polygonal profile sides (low poly, crisp facets)
SHELL_SEGMENTS = 6           # taper segments along +Y (6 rings base→tip)
CORE_RATIO = 0.40            # core radius as fraction of shell radius
CORE_BASE_RADIUS = SHELL_BASE_RADIUS * CORE_RATIO   # 0.026
CORE_TIP_RADIUS = 0.008                       # WU near-point tip
CORE_SEGMENTS = 4                           # core taper segments (4 rings)
CORE_INSET = 0.004                          # WU Y-inset so the core sits INSIDE
                                             # the shell (no coplanar z-fighting)

# Material colors (analytic, no textures).
# The core is authored WHITE (1,1,1) so it is runtime TINTABLE from the song
# palette (the renderer applies per-hand diffuse/emissive = hand color).
# The shell is authored DARK near #161c24 (sRGB) with a subtle low-gain
# emissive edge tint (same hue at low gain) — the crisp dark blade edge that
# reads over both bright Aero and dark Camera backgrounds.
CORE_COLOR = (1.0, 1.0, 1.0, 1.0)
SHELL_BASE = (0.086, 0.110, 0.141, 1.0)   # sRGB #161c24 → linear-ish facade
SHELL_EDGE_GAIN = 0.18                    # subtle low-gain emissive on the shell
SHELL_EDGE = tuple(c * SHELL_EDGE_GAIN for c in (0.28, 0.42, 0.60)) + (1.0,)

# ── Build the scene ────────────────────────────────────────────────────────
# Start from a fresh scene (clear any default mesh/camera/light).
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for block in (bpy.data.meshes, bpy.data.materials):
    for item in list(block):
        if item.users == 0:
            block.remove(item)

def make_material(name, base, emissive, emissive_gain):
    """Create an unlit analytic material (no lighting, no textures).

    The renderer forces `useLighting=false` on all equipment materials, so
    the GLB material only carries:
      - baseColorFactor (the authored color, runtime-tintable for the core),
      - a subtle emissive (low gain for the shell, 1.0 for the core),
      - OPAQUE blend + double-sided (cull off).
    """
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for node in list(nodes):
        nodes.remove(node)
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (300, 0)
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (0, 0)
    principled.inputs["Base Color"].default_value = base
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Roughness"].default_value = 0.6
    if "Emission Color" in principled.inputs:
        principled.inputs["Emission Color"].default_value = emissive
        principled.inputs["Emission Strength"].default_value = emissive_gain
    elif "Emission" in principled.inputs:
        principled.inputs["Emission"].default_value = emissive
    links.new(principled.outputs[0], out.inputs[0])
    mat.blend_method = "OPAQUE"
    mat.use_backface_culling = False
    return mat

def build_tapered_blade(name, base_radius, tip_radius, sides, segments, y0, y1):
    """Build a tapered N-sided blade from ring at y0 (base radius) to ring at
    y1 (tip radius). Returns the created mesh object (without material).

    Faces are built as explicit (a, b, c) vertex-index tuples so
    `mesh.from_pydata` sees a list of faces, not a flat index stream.
    """
    rings = []
    for i in range(segments + 1):
        t = i / segments
        r = base_radius + (tip_radius - base_radius) * t
        ring = []
        for s in range(sides):
            angle = 2 * math.pi * s / sides
            x = r * math.cos(angle)
            z = r * math.sin(angle)
            ring.append((x, y0 + (y1 - y0) * t, z))
        rings.append(ring)
    verts = [v for ring in rings for v in ring]
    faces = []
    for i in range(segments):
        a = i * sides
        b = (i + 1) * sides
        for s in range(sides):
            s_next = (s + 1) % sides
            # Two triangles per side-quad (outward-CCW winding for +Y-up
            # outward normals in the blade's local frame).
            faces.append((a + s, a + s_next, b + s_next))
            faces.append((a + s, b + s_next, b + s))
    # Base cap: fan from a new center vertex at y0.
    base_center = len(verts)
    verts.append((0.0, y0, 0.0))
    for s in range(sides):
        s_next = (s + 1) % sides
        faces.append((base_center, s_next, s))
    # Tip cap: fan from a new center vertex at y1.
    tip_center = len(verts)
    verts.append((0.0, y1, 0.0))
    for s in range(sides):
        s_next = (s + 1) % sides
        tip_a = segments * sides + s
        tip_b = segments * sides + s_next
        faces.append((tip_center, tip_a, tip_b))
    mesh = bpy.data.meshes.new(name=name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj

# Build the shell (base at y=0, tip at y=BLADE_LENGTH).
shell = build_tapered_blade(
    name="flow-saber-v1/shell",
    base_radius=SHELL_BASE_RADIUS,
    tip_radius=SHELL_TIP_RADIUS,
    sides=SHELL_SIDES,
    segments=SHELL_SEGMENTS,
    y0=0.0,
    y1=BLADE_LENGTH,
)
# Build the core (inset so it sits inside the shell, full axis span).
core = build_tapered_blade(
    name="flow-saber-v1/core",
    base_radius=CORE_BASE_RADIUS,
    tip_radius=CORE_TIP_RADIUS,
    sides=SHELL_SIDES,
    segments=CORE_SEGMENTS,
    y0=CORE_INSET,
    y1=BLADE_LENGTH - CORE_INSET,
)

# Assign materials.
shell_mat = make_material("mat/saber_shell", SHELL_BASE, SHELL_EDGE, SHELL_EDGE_GAIN)
core_mat = make_material("mat/saber_core", CORE_COLOR, (1.0, 1.0, 1.0, 1.0), 1.0)
shell.data.materials.append(shell_mat)
core.data.materials.append(core_mat)

# Pivot: origin at the wrist end (y=0) so the blade extends +Y from the wrist.
# (The renderer places the entity at the wrist and rotates +Y toward the
#  direction; the existing orientation math `eulerZ = 90 - atan2(dirY, dirX)`
#  was authored for a cylinder aligned to +Y, so this matches.)

# ── Export the GLB ─────────────────────────────────────────────────────────
out_dir = Path(__file__).resolve().parent.parent.parent / "assets" / "gameplay" / "0.0.11" / "flow-saber"
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "flow-saber-v1.glb"

# Select only the two blade meshes and export.
for obj in (shell, core):
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(out_path),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="EXPORT",
    export_yup=True,
    export_extras=True,
)
print(f"[flow-saber-v1] exported {out_path}")

# ── Triangle count report ──────────────────────────────────────────────────
def tri_count(obj):
    # Sum (verts - 2) per polygon; polygons are n-gons but our quads/tris are
    # simple. For a fan cap of `sides` triangles each contributes 1 tri.
    total = 0
    for poly in obj.data.polygons:
        total += int(len(poly.vertices)) - 2
    return total
print(f"[flow-saber-v1] shell tris = {tri_count(shell)}")
print(f"[flow-saber-v1] core tris = {tri_count(core)}")
print(f"[flow-saber-v1] total tris = {tri_count(shell) + tri_count(core)}")
print(f"[flow-saber-v1] shell base radius = {SHELL_BASE_RADIUS}, tip = {SHELL_TIP_RADIUS}")
print(f"[flow-saber-v1] core base radius = {CORE_BASE_RADIUS}, tip = {CORE_TIP_RADIUS}")
print(f"[flow-saber-v1] length = {BLADE_LENGTH} WU (== detection capsule length)")
print(f"[flow-saber-v1] materials = mat/saber_shell (dark, low-gain edge), mat/saber_core (tintable emissive)")
