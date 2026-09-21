# Headless Blender review renders for the flow-saber model (Derrick's visual sign-off loop).
#
# Usage (headless):
#   blender -b --python scripts/blender/render-flow-saber-review.py -- \
#     /abs/path/to/flow-saber-v1.glb /abs/path/to/output-dir
#
# Produces 1280x720 angled product renders (dark background + grid floor + area light):
#   4 blade colors at angle1, theme-blue at angle2 + angle2b, and one dimmed variant.
# The glow is approximated in-scene with an additive halo matched to the in-engine
# parameters (radius 0.045 WU, blade tint x gain 1.0) — the runtime glow itself is
# staged by the renderer and is not part of the GLB.
import sys, os, math

_args = sys.argv
argv = _args[_args.index("--") + 1:] if "--" in _args else []
glb_path, out_dir = argv[0], argv[1]

# ---- in-engine parameters (keep in sync with renderer stageSaber glow) ----
GLOW_RADIUS = 0.045
GLOW_GAIN = 0.6
GLOW_ALPHA = 0.5
GLOW_CENTER_Y = 0.465
GLOW_LENGTH = 0.63
DIM = 0.45

COLORS = [
    ("theme-blue", (0x26 / 255, 0x93 / 255, 0xff / 255, 1.0)),
    ("theme-green", (0x39 / 255, 0xc9 / 255, 0x6b / 255, 1.0)),
    ("song-blue", (0x24 / 255, 0x68 / 255, 0xac / 255, 1.0)),
    ("song-orange", (0xff / 255, 0x7a / 255, 0x2f / 255, 1.0)),
]
# (name, elevation_deg, azimuth_deg)
ANGLES = [
    ("angle1", 35, 30),
    ("angle2", 40, -35),
    ("angle2b", 20, 70),
]
SABER_LENGTH = 0.75

import bpy

# clean scene
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for block_list in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images):
    for block in list(block_list):
        if block.users == 0:
            block_list.remove(block)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.cycles.samples = 16
scene.eevee.taa_render_samples = 32
scene.world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.035, 0.045, 0.055, 1.0)
scene.render.film_transparent = False

# ---- import saber GLB (blade points +Y, hilt base at origin) ----
bpy.ops.import_scene.gltf(filepath=glb_path)
saber_objs = [o for o in bpy.context.selected_objects]
for o in saber_objs:
    o.select_set(True)
with bpy.context.temp_override(selected_objects=saber_objs, active_object=saber_objs[0]):
    bpy.ops.object.join()
saber = bpy.context.active_object
saber.name = "flow_saber"

# find materials by name substring
def mat_by_sub(needle):
    for m in saber.data.materials:
        if m and needle in m.name.lower():
            return m
    return None
blade_mat = mat_by_sub("blade") or saber.data.materials[0]
hilt_mat = mat_by_sub("hilt")

# ---- glow: NOT scene geometry ----
# The in-engine glow is an additive-blend halo staged by the renderer around the
# blade section (radius 0.045 WU, tint x gain 0.6). A transparent cylinder in
# the scene does NOT read as glow (Derrick's call) — the review render
# reproduces the additive look with compositor BLOOM: the emissive blade is
# thresholded, blurred, and added back over the frame (see setup below).

# ---- grid floor (viewport-style) ----
bpy.ops.mesh.primitive_grid_add(x_subdivisions=60, y_subdivisions=60, size=12, location=(0, 0.4, -0.05))
grid = bpy.context.active_object
grid.name = "floor_grid"
wf = grid.modifiers.new("wire", "WIREFRAME")
wf.thickness = 0.005
grid_mat = bpy.data.materials.new("grid_mat")
grid_mat.use_nodes = True
bsdf = grid_mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.20, 0.23, 0.28, 1.0)
grid.data.materials.append(grid_mat)

# ---- lights ----
bpy.ops.object.light_add(type="AREA", location=(2.2, 0.9, 2.6))
key = bpy.context.active_object
key.data.energy = 320
key.data.size = 2.0
key.rotation_euler = (math.radians(35), 0, math.radians(-40))
bpy.ops.object.light_add(type="AREA", location=(-2.4, 0.0, 1.4))
fill = bpy.context.active_object
fill.data.energy = 90
fill.data.size = 3.0
fill.rotation_euler = (math.radians(55), 0, math.radians(50))

# ---- camera orbit helper ----
import mathutils
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 50
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
TARGET = (0, SABER_LENGTH * 0.52, 0)
def place_cam(elev_deg, azim_deg, dist=2.6):
    e, a = math.radians(elev_deg), math.radians(azim_deg)
    cam.location = (
        TARGET[0] + dist * math.cos(e) * math.sin(a),
        TARGET[1] + dist * math.cos(e) * math.cos(a),
        TARGET[2] + dist * math.sin(e),
    )
    d = mathutils.Vector(TARGET) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

# ---- glow: two-pass additive composite (like in-engine BLEND_ADDITIVE) ----
# Each job renders TWICE: (1) the scene (grid + saber, opaque film), (2) a
# glow pass (saber only, TRANSPARENT film). The glow pass is the saber on
# black/alpha — blurring it and ADDing it over the scene reproduces the
# in-engine additive halo: colored (not blown-out white), and confined to the
# blade (the grid/background never bloom). Compositing is done with PIL below.
from PIL import Image, ImageChops, ImageFilter

def set_blade(color, alpha=1.0, mode="scene"):
    if blade_mat.use_nodes:
        bsdf = blade_mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            if mode == "glow":
                # Pure white emitter: the glow pass is a LUMINANCE MASK only.
                # The exact blade color is applied in the PIL composite, so the
                # halo matches the file-listed color (Derrick's call).
                bsdf.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
                bsdf.inputs["Emission Color"].default_value = (1.0, 1.0, 1.0, 1.0)
                bsdf.inputs["Emission Strength"].default_value = 1.0
                blade_mat.blend_method = "OPAQUE"
                if "Alpha" in bsdf.inputs:
                    bsdf.inputs["Alpha"].default_value = 1.0
            else:
                # bright but color-preserving (no white blowout) — matches the
                # in-engine tinted emissive blade
                bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
                bsdf.inputs["Emission Color"].default_value = (color[0], color[1], color[2], 1.0)
                bsdf.inputs["Emission Strength"].default_value = 1.0 * alpha
                blade_mat.blend_method = "BLEND" if alpha < 1.0 else "OPAQUE"
                if "Alpha" in bsdf.inputs:
                    bsdf.inputs["Alpha"].default_value = alpha

os.makedirs(out_dir, exist_ok=True)
jobs = []
for name, color in COLORS:
    jobs.append((f"r2-saber-{name}-angle1.png", color, 1.0, ANGLES[0][1], ANGLES[0][2]))
jobs.append((f"r2-saber-theme-blue-angle2.png", COLORS[0][1], 1.0, ANGLES[1][1], ANGLES[1][2]))
jobs.append((f"r2-saber-theme-blue-angle2b.png", COLORS[0][1], 1.0, ANGLES[2][1], ANGLES[2][2]))
jobs.append((f"r2-saber-dimmed-theme-blue.png", COLORS[0][1], DIM, ANGLES[0][1], ANGLES[0][2]))

for fname, color, alpha, elev, azim in jobs:
    place_cam(elev, azim)
    final_path = os.path.join(out_dir, fname)
    glow_path = os.path.join(out_dir, ".glow-" + fname)
    # Pass 1: glow pass — saber only, WHITE emitter (luminance mask), transparent film
    set_blade(color, alpha, mode="glow")
    grid.hide_render = True
    scene.render.film_transparent = True
    scene.render.filepath = glow_path
    bpy.ops.render.render(write_still=True)
    # Pass 2: scene pass — tinted blade + grid, opaque film
    set_blade(color, alpha, mode="scene")
    grid.hide_render = False
    scene.render.film_transparent = False
    scene.render.filepath = final_path
    bpy.ops.render.render(write_still=True)
    # Additive composite: scene + halos tinted with the EXACT file color.
    # halo = blur(white luminance mask) x file-color x dim-factor.
    base = Image.open(final_path).convert("RGB")
    glow = Image.open(glow_path).convert("RGB")
    tint_img = Image.new("RGB", base.size, (int(color[0] * 255), int(color[1] * 255), int(color[2] * 255)))
    dim_img = Image.new("RGB", base.size, (int(255 * alpha),) * 3)
    def tinted_halo(radius):
        h = glow.filter(ImageFilter.GaussianBlur(radius))
        return ImageChops.multiply(ImageChops.multiply(h, tint_img), dim_img)
    out_img = ImageChops.add(ImageChops.add(base, tinted_halo(8)), tinted_halo(22))
    out_img.save(final_path)
    os.remove(glow_path)
    print(f"[render-saber] {fname} elev={elev} azim={azim} alpha={alpha}")
print("[render-saber] DONE")
