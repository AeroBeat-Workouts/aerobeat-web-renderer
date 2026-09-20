# 0.0.62 L-C (r2lb r2) — BUILD SCRIPT: flow-saber-v2 two-cylinder GLB.
#
# Classic lightsaber silhouette: TWO joined, collinear cylinders along local +Y.
#   - HILT: short cylinder (y=0 → HILT_LENGTH), dark gunmetal, NOT tintable.
#   - BLADE: longer cylinder (y=HILT_LENGTH → HILT_LENGTH + BLADE_LENGTH),
#     the per-hand TINTABLE emissive section.
#   - ROUNDED TIP: hemisphere at the blade's far end (same material as blade).
#
# Total visible length = HILT_LENGTH + BLADE_LENGTH + BLADE_RADIUS = 0.75 WU
# (== detection capsule length, what-you-see-is-what-hits).
#
# Material slots:
#   mat/saber_hilt  — dark structural gunmetal (NOT tintable, no emissive glow)
#   mat/saber_blade — bright emissive (runtime TINTABLE per hand, carries song-palette color)
#
# MATERIAL CONSTRAINTS (0.0.61 baseline defect fix + r2 GATE 1-R1):
#   Both slots: OPAQUE normal blend, depthWrite ON, depthTest ON, useLighting=false.
#   The blade dims via opacity (0.45). The in-engine additive glow dims via
#   color/emissive scaling (× 0.45) — PlayCanvas additive blend ignores alpha.
#
# Geometry (design constants, GATE 1-R1 suggested dims):
#   HILT:  length 0.18 WU, radius 0.030 WU, 8-sided
#   BLADE: length 0.546 WU, radius 0.024 WU, 8-sided
#   TIP:   hemisphere radius 0.024 WU (blade radius), 8×4 segments
#   Total: 0.18 + 0.546 + 0.024 = 0.75 WU
#   Tri count: ~200 (well under 400 target)
#
# Reproducibility:
#   blender -b --python build-flow-saber-v2.py
#   Output: assets/gameplay/0.0.11/flow-saber/flow-saber-v1.glb (same filename, new bytes)
#   For renders: blender -b --python build-flow-saber-v2.py --render
#
import math
import sys
from pathlib import Path

import bpy

# ── Design constants (GATE 1-R1) ───────────────────────────────────────────
HILT_LENGTH = 0.18         # WU
HILT_RADIUS = 0.030        # WU
BLADE_RADIUS = 0.024       # WU (slightly thinner than hilt)
BLADE_LENGTH = 0.75 - HILT_LENGTH - BLADE_RADIUS  # = 0.546 WU
SIDES = 8                  # 8-sided cylinders
HILT_Y0 = 0.0
HILT_Y1 = HILT_LENGTH
BLADE_Y0 = HILT_LENGTH
BLADE_Y1 = HILT_LENGTH + BLADE_LENGTH  # = 0.726
TIP_CENTER_Y = BLADE_Y1   # hemisphere centered at blade far end
TIP_SEGMENTS = 4          # hemisphere rings (4 rings from equator to pole)

# Material colors (analytic, no textures).
# Hilt: dark gunmetal, subtle metallic feel. NOT tintable.
HILT_BASE = (0.165, 0.192, 0.220, 1.0)  # sRGB #2a3038 → linear-ish
HILT_METAL = 0.6
HILT_ROUGH = 0.35
# Blade: authored WHITE (1,1,1) so it is runtime TINTABLE from the song palette.
# The renderer applies per-hand diffuse/emissive = hand color.
BLADE_BASE = (1.0, 1.0, 1.0, 1.0)
BLADE_EMISSIVE = (1.0, 1.0, 1.0, 1.0)
BLADE_EMISSIVE_GAIN = 1.0

# ── Clear the scene ────────────────────────────────────────────────────────
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for block in (bpy.data.meshes, bpy.data.materials):
    for item in list(block):
        if item.users == 0:
            block.remove(item)

def make_material(name, base, metallic, roughness, emissive=None, emissive_gain=0.0):
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
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if emissive:
        if "Emission Color" in principled.inputs:
            principled.inputs["Emission Color"].default_value = emissive
            principled.inputs["Emission Strength"].default_value = emissive_gain
        elif "Emission" in principled.inputs:
            principled.inputs["Emission"].default_value = emissive
    links.new(principled.outputs[0], out.inputs[0])
    mat.blend_method = "OPAQUE"
    mat.use_backface_culling = False
    return mat

def make_cylinder(name, radius, y0, y1, sides):
    """Build an N-sided cylinder from ring at y0 to ring at y1.
    Returns the mesh object (no material)."""
    verts = []
    faces = []
    # Side quads: 2 rings × N verts
    for i in range(sides):
        angle = 2 * math.pi * i / sides
        x = radius * math.cos(angle)
        z = radius * math.sin(angle)
        verts.append((x, y0, z))
    for i in range(sides):
        angle = 2 * math.pi * i / sides
        x = radius * math.cos(angle)
        z = radius * math.sin(angle)
        verts.append((x, y1, z))
    # Side faces (N quads = 2N tris)
    for i in range(sides):
        i_next = (i + 1) % sides
        a = i
        b = i_next
        c = sides + i_next
        d = sides + i
        faces.append((a, b, c))
        faces.append((a, c, d))
    # Base cap: fan from center at y0 (N tris)
    base_center = len(verts)
    verts.append((0.0, y0, 0.0))
    for i in range(sides):
        i_next = (i + 1) % sides
        faces.append((base_center, i_next, i))
    # Tip cap: fan from center at y1 (N tris) — for hilt only; blade tip is a hemisphere
    tip_center = len(verts)
    verts.append((0.0, y1, 0.0))
    for i in range(sides):
        i_next = (i + 1) % sides
        faces.append((tip_center, sides + i, sides + i_next))
    mesh = bpy.data.meshes.new(name=name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj

def make_hemisphere(name, radius, center_y, sides, segments):
    """Build a hemisphere (half UV-sphere) centered at (0, center_y, 0),
    pointing in +Y. The hemisphere goes from the equator (y=center_y) to the
    north pole (y=center_y+radius). N-sided, M-segment rings.
    Returns the mesh object (no material)."""
    verts = []
    faces = []
    rings = []
    for seg in range(segments + 1):
        # theta: 0 (equator) to PI/2 (north pole)
        theta = (math.pi / 2) * seg / segments
        ring = []
        for s in range(sides):
            phi = 2 * math.pi * s / sides
            x = radius * math.cos(theta) * math.cos(phi)
            y = center_y + radius * math.sin(theta)
            z = radius * math.cos(theta) * math.sin(phi)
            ring.append((x, y, z))
        rings.append(ring)
    # Ring 0 is the equator (N verts at y=center_y)
    for ring in rings:
        for v in ring:
            verts.append(v)
    # Side faces: (segments) rings × (sides) quads = 2*segments*sides tris
    for seg in range(segments):
        a_base = seg * sides
        b_base = (seg + 1) * sides
        for s in range(sides):
            s_next = (s + 1) % sides
            a = a_base + s
            b = a_base + s_next
            c = b_base + s_next
            d = b_base + s
            faces.append((a, b, c))
            faces.append((a, c, d))
    # North pole cap: fan from a new pole vertex (sides tris)
    pole = len(verts)
    verts.append((0.0, center_y + radius, 0.0))
    last_ring = segments * sides
    for s in range(sides):
        s_next = (s + 1) % sides
        faces.append((pole, last_ring + s, last_ring + s_next))
    mesh = bpy.data.meshes.new(name=name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj

# ── Build the geometry ─────────────────────────────────────────────────────
# Hilt: cylinder from y=0 to y=HILT_LENGTH, with caps at both ends.
hilt = make_cylinder(
    name="flow-saber-v2/hilt",
    radius=HILT_RADIUS,
    y0=HILT_Y0,
    y1=HILT_Y1,
    sides=SIDES,
)

# Blade: cylinder from y=HILT_LENGTH to y=BLADE_Y1, with cap at base only
# (the tip end is open — the hemisphere closes it).
blade = make_cylinder(
    name="flow-saber-v2/blade",
    radius=BLADE_RADIUS,
    y0=BLADE_Y0,
    y1=BLADE_Y1,
    sides=SIDES,
)

# Rounded tip: hemisphere at the blade's far end, pointing +Y.
tip = make_hemisphere(
    name="flow-saber-v2/tip",
    radius=BLADE_RADIUS,
    center_y=TIP_CENTER_Y,
    sides=SIDES,
    segments=TIP_SEGMENTS,
)

# ── Materials ───────────────────────────────────────────────────────────────
hilt_mat = make_material("mat/saber_hilt", HILT_BASE, HILT_METAL, HILT_ROUGH)
blade_mat = make_material("mat/saber_blade", BLADE_BASE, 0.0, 0.6, BLADE_EMISSIVE, BLADE_EMISSIVE_GAIN)

hilt.data.materials.append(hilt_mat)
blade.data.materials.append(blade_mat)
tip.data.materials.append(blade_mat)  # tip uses blade material (tintable)

# ── Export the GLB ─────────────────────────────────────────────────────────
out_dir = Path(__file__).resolve().parent.parent.parent / "assets" / "gameplay" / "0.0.11" / "flow-saber"
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "flow-saber-v1.glb"

for obj in (hilt, blade, tip):
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
print(f"[flow-saber-v2] exported {out_path}")

# ── Triangle count report ──────────────────────────────────────────────────
def tri_count(obj):
    total = 0
    for poly in obj.data.polygons:
        total += int(len(poly.vertices)) - 2
    return total

print(f"[flow-saber-v2] hilt tris = {tri_count(hilt)}")
print(f"[flow-saber-v2] blade tris = {tri_count(blade)}")
print(f"[flow-saber-v2] tip tris = {tri_count(tip)}")
print(f"[flow-saber-v2] total tris = {tri_count(hilt) + tri_count(blade) + tri_count(tip)}")
print(f"[flow-saber-v2] hilt: length={HILT_LENGTH}, radius={HILT_RADIUS}, sides={SIDES}")
print(f"[flow-saber-v2] blade: length={BLADE_LENGTH:.4f}, radius={BLADE_RADIUS}, sides={SIDES}")
print(f"[flow-saber-v2] tip: radius={BLADE_RADIUS}, segments={TIP_SEGMENTS}")
print(f"[flow-saber-v2] total length = {HILT_LENGTH + BLADE_LENGTH + BLADE_RADIUS:.4f} WU (== detection capsule 0.75)")
print(f"[flow-saber-v2] materials = mat/saber_hilt (gunmetal, not tintable), mat/saber_blade (tintable emissive)")

# ── Render mode (review artifacts) ─────────────────────────────────────────
# When invoked with --render, set up a camera + dark background + grid floor
# and render the saber at multiple angles/colors.
RENDER_MODE = "--render" in sys.argv

if RENDER_MODE:
    print("[flow-saber-v2] entering render mode")

    # Clear the scene for rendering (keep the saber meshes + materials).
    # Remove any camera/light that may exist.
    for obj in list(bpy.data.objects):
        if obj.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(obj, do_unlink=True)

    # Dark background
    scene = bpy.context.scene
    world = scene.world
    if world is None:
        world = bpy.data.worlds.new("world")
        scene.world = world
    world.use_nodes = True
    bg_node = world.node_tree.nodes.get("Background")
    if bg_node:
        bg_node.inputs[0].default_value = (0.02, 0.025, 0.03, 1.0)  # very dark blue
        bg_node.inputs[1].default_value = 1.0

    # Grid floor (subtle, at y = -0.1)
    grid_mat = bpy.data.materials.new("grid_floor")
    grid_mat.use_nodes = True
    grid_nodes = grid_mat.node_tree.nodes
    for node in list(grid_nodes):
        grid_nodes.remove(node)
    grid_out = grid_nodes.new("ShaderNodeOutputMaterial")
    grid_principled = grid_nodes.new("ShaderNodeBsdfPrincipled")
    grid_principled.inputs["Base Color"].default_value = (0.05, 0.06, 0.07, 1.0)
    grid_principled.inputs["Metallic"].default_value = 0.0
    grid_principled.inputs["Roughness"].default_value = 0.8
    grid_mat.node_tree.links.new(grid_principled.outputs[0], grid_out.inputs[0])
    grid_mat.blend_method = "OPAQUE"
    bpy.ops.mesh.primitive_plane_add(size=3.0, location=(0, -0.1, 0))
    grid_obj = bpy.context.active_object
    grid_obj.name = "grid_floor"
    grid_obj.data.materials.append(grid_mat)

    # Light: one area light from above-front, subtle.
    light_data = bpy.data.lights.new("key_light", type="AREA")
    light_data.energy = 50
    light_data.size = 1.0
    light_data.color = (0.95, 0.97, 1.0)
    light_obj = bpy.data.objects.new("key_light", light_data)
    light_obj.location = (0.5, 1.2, 1.5)
    light_obj.rotation_euler = (math.radians(30), 0, math.radians(-20))
    bpy.context.scene.collection.objects.link(light_obj)

    # Camera helper
    def setup_camera(name, elev_deg, azim_deg, target=(0, 0.375, 0), dist=1.6):
        """Position a camera at the given elevation/azimuth looking at target."""
        elev = math.radians(elev_deg)
        azim = math.radians(azim_deg)
        cx = target[0] + dist * math.cos(elev) * math.sin(azim)
        cy = target[1] + dist * math.sin(elev)
        cz = target[2] + dist * math.cos(elev) * math.cos(azim)
        cam_data = bpy.data.cameras.new(name=name)
        cam_data.lens = 50
        cam = bpy.data.objects.new(name, cam_data)
        cam.location = (cx, cy, cz)
        bpy.context.scene.collection.objects.link(cam)
        # Point the camera at the target
        direction = (
            target[0] - cx,
            target[1] - cy,
            target[2] - cz,
        )
        length = math.sqrt(sum(c * c for c in direction))
        if length > 0:
            direction = tuple(c / length for c in direction)
        # Convert direction to Euler rotation (Y-up camera convention)
        yaw = math.atan2(direction[0], direction[2])
        pitch = math.atan2(direction[1], math.sqrt(direction[0] ** 2 + direction[2] ** 2))
        cam.rotation_euler = (math.pi / 2 - pitch, 0, yaw)
        scene.camera = cam
        return cam

    # Color palette (same as sweep)
    COLORS = {
        "theme_blue": (0.149, 0.576, 1.0),    # #2693ff
        "theme_green": (0.224, 0.788, 0.420),  # #39c96b
        "song_blue": (0.141, 0.408, 0.675),    # #2468AC
        "song_orange": (1.0, 0.478, 0.184),    # #FF7A2F
    }

    def set_blade_color(hex_color):
        """Set the blade material to a specific color (for renders)."""
        mat = bpy.data.materials.get("mat/saber_blade")
        if mat and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    if "Emission Color" in node.inputs:
                        node.inputs["Emission Color"].default_value = hex_color + (1.0,)
                        node.inputs["Emission Strength"].default_value = 1.0
                    node.inputs["Base Color"].default_value = hex_color + (1.0,)

    # Set blade opacity (for dimmed render)
    def set_blade_opacity(alpha):
        mat = bpy.data.materials.get("mat/saber_blade")
        if mat:
            mat.blend_method = "BLEND"
            node = mat.node_tree.nodes.get("Principled BSDF")
            if node:
                if "Alpha" in node.inputs:
                    node.inputs["Alpha"].default_value = alpha
                if "Emission Strength" in node.inputs:
                    node.inputs["Emission Strength"].default_value = alpha * 1.0

    # Reset blade to full opacity
    def reset_blade():
        mat = bpy.data.materials.get("mat/saber_blade")
        if mat:
            mat.blend_method = "OPAQUE"
            node = mat.node_tree.nodes.get("Principled BSDF")
            if node:
                if "Alpha" in node.inputs:
                    node.inputs["Alpha"].default_value = 1.0
                if "Emission Strength" in node.inputs:
                    node.inputs["Emission Strength"].default_value = 1.0

    # Output directory
    # Output to the assembly repo's evidence dir (parent of the renderer repo).
    render_dir = Path(__file__).resolve().parent.parent.parent.parent.parent / "aerobeat-web-assembly" / ".plans" / "evidence" / "2026-09-19-0.0.62-saber-r2"
    render_dir.mkdir(parents=True, exist_ok=True)

    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    renders = [
        # (name, color, elev, azim, dimmed)
        ("r2-saber-theme-blue-angle1", "theme_blue", 35, 30, False),
        ("r2-saber-theme-green-angle1", "theme_green", 35, 30, False),
        ("r2-saber-song-blue-angle1", "song_blue", 35, 30, False),
        ("r2-saber-song-orange-angle1", "song_orange", 35, 30, False),
        ("r2-saber-theme-blue-angle2", "theme_blue", 40, -35, False),
        ("r2-saber-theme-blue-angle2b", "theme_blue", 20, 70, False),
        ("r2-saber-dimmed-theme-blue", "theme_blue", 35, 30, True),
    ]

    for name, color_key, elev, azim, dimmed in renders:
        reset_blade()
        if dimmed:
            set_blade_color(COLORS[color_key])
            set_blade_opacity(0.45)
        else:
            set_blade_color(COLORS[color_key])
        setup_camera(name, elev, azim)
        out_path = render_dir / f"{name}.png"
        scene.render.filepath = str(out_path)
        bpy.ops.render.render(write_still=True)
        print(f"[flow-saber-v2] rendered {out_path}")

    print("[flow-saber-v2] render complete")
