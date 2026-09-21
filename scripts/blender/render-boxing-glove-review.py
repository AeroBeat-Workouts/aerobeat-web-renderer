# Headless Blender review renders for the boxing-glove model (Derrick's visual sign-off loop).
#
# Usage (headless):
#   blender -b --python scripts/blender/render-boxing-glove-review.py -- \
#     /abs/path/to/boxing-glove-v1.glb /abs/path/to/output-dir
#
# Produces 1280x720 angled product renders (dark background + grid floor + area lights):
#   4 glove colors at angle1, theme-blue at angle2 + angle2b, and one dimmed variant.
# NO glow / halo / additive composite — the glove has no engine-side glow, so each
# job is a single render pass (unlike the saber script's two-pass glow composite).
#
# TRUE post-import mapping (verified against the GLB's POSITION min/max):
#   thumb = +X (span -0.26..0.29), knuckle-face normal = +Y (symmetric +/-0.23),
#   wrist/cuff end = +Z (span -0.20..0.26) in glTF/PlayCoords. In-engine the
#   equipment sits at z~0.45-0.5 and the athlete camera is on the +Z side of the
#   grid, so the athlete sees the glove from the CUFF side: cuff toward the
#   athlete, top of fist tilting toward the grid, knuckle face up on screen.
# The glTF import is Y-up, so the imported object sits in that frame directly.
# Our camera (place_cam) orbits the +Y_b (Blender) hemisphere, which after the
# import maps to the GLOVE-TOP side — the face the athlete never sees in-game.
# We therefore rotate the imported glove 180 deg about the Blender Z axis
# (right after the import+join, before the grid floor is added) so the
# in-engine athlete-facing side (GLB +Z / cuff side) points toward the +Y_b
# camera hemisphere: cuff side faces the camera, knuckles up on screen, thumb
# visible off to one side. After the flip the thumb is most clearly visible at
# azimuth -35 deg (angle2), where the camera swings to the glove's +X_b side.
#
# Material (mirrors the in-engine UNLIT body, at the RAW file tint): these review
# renders are Derrick's design verdict on the MODEL, so the tints must read as
# their EXACT file colors. Base Color = black (the area lights contribute
# nothing — no wash-toward-white), and the EMISSION is driven by the job color
# modulated by the GLB's baked COLOR_0 vertex AO: a Color Attribute node
# (attribute name "Col", CORNER domain — verified against the GLB) -> MixRGB
# MULTIPLY (Color1 = AO, Color2 = job tint) -> Emission Color, with Emission
# Strength = 1.0 x alpha (dimmed job -> 1.0 x 0.45). The in-engine emissive gain
# (diffuse + 0.4 emissive = 1.4x, hard-clipped) is a SEPARATE knob applied/tuned
# in the sweep/r2b step — it is deliberately NOT baked into these r1 sign-off
# renders. view_transform is "Standard" (not AgX) so the tint reads punchy rather
# than desaturated. The COLOR_0 vertex AO stays active on top of the tint (do NOT
# disable it).
import sys, os, math

_args = sys.argv
argv = _args[_args.index("--") + 1:] if "--" in _args else []
glb_path, out_dir = argv[0], argv[1]
# optional: "--jobs N" renders only the first N jobs (test/preview runs). Default: all.
_jobs_limit = None
for _i, _a in enumerate(argv[2:], start=2):
    if _a == "--jobs" and _i + 1 < len(argv):
        try:
            _jobs_limit = int(argv[_i + 1])
        except ValueError:
            _jobs_limit = None

# ---- in-engine parameters (keep in sync with renderer glove tint) ----
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
# Standard view transform: the glove is unlit (pure emission + vertex AO), and the
# in-engine look hard-clips. AgX (the 4.0 default) desaturates bright emission and
# washes the colors toward white — Standard keeps the punchy, saturated tint.
scene.view_settings.view_transform = "Standard"

# ---- import glove GLB (glTF Y-up; thumb +X, knuckle face +Y, cuff +Z — see header) ----
bpy.ops.import_scene.gltf(filepath=glb_path)
glove_objs = [o for o in bpy.context.selected_objects]
for o in glove_objs:
    o.select_set(True)
with bpy.context.temp_override(selected_objects=glove_objs, active_object=glove_objs[0]):
    bpy.ops.object.join()
glove = bpy.context.active_object
glove.name = "boxing_glove"
# 180 deg about Blender Z: point the in-engine athlete-facing (cuff) side toward the
# +Y_b camera hemisphere so the renders match what the athlete sees in-game.
glove.rotation_euler = (0, 0, math.radians(180))
with bpy.context.temp_override(active_object=glove, selected_objects=[glove]):
    bpy.ops.object.transform_apply(rotation=True)

# single material slot (mat/glove_body); keep the COLOR_0 vertex AO active.
def mat_by_sub(needle):
    for m in glove.data.materials:
        if m and needle in m.name.lower():
            return m
    return None
body_mat = mat_by_sub("glove_body") or glove.data.materials[0]

# ---- unlit material (mirrors in-engine): final pixel = color x AO x 1.4, hard-clip ----
# The glTF import applies the baked vertex AO (COLOR_0) automatically; we read it
# back through a Color Attribute node and modulate the EMISSION with it. Base Color
# is black so the area lights contribute nothing to the glove (unlit — no lighting
# wash toward white). Verified attribute name on this GLB: "Col" (CORNER domain).
body_mat.use_nodes = True
bnd = body_mat.node_tree
bnd.nodes.clear()
_out   = bnd.nodes.new("ShaderNodeOutputMaterial");  _out.location   = (360, 0)
_bsdf  = bnd.nodes.new("ShaderNodeBsdfPrincipled"); _bsdf.location  = (0, 0)
_attr  = bnd.nodes.new("ShaderNodeVertexColor");    _attr.location  = (-560, 160)
_attr.layer_name = "Col"   # the GLB's baked AO attribute (CORNER domain, verified)
_mix   = bnd.nodes.new("ShaderNodeMixRGB");         _mix.location   = (-280, 160)
_mix.blend_type = "MULTIPLY"
_mix.inputs["Fac"].default_value = 1.0
# AO (Color Attribute "Col", CORNER domain) x job tint (MixRGB Factor B) -> Emission Color
bnd.links.new(_out.inputs["Surface"], _bsdf.outputs["BSDF"])
bnd.links.new(_attr.outputs["Color"], _mix.inputs["Color1"])
bnd.links.new(_mix.outputs["Color"],  _bsdf.inputs["Emission Color"])
_bsdf.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
_bsdf.inputs["Roughness"].default_value = 0.6

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

# ---- camera orbit helper (pulled out a bit, angled perspective) ----
import mathutils
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 50
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
TARGET = (0, 0, 0)
def place_cam(elev_deg, azim_deg, dist=1.8):
    e, a = math.radians(elev_deg), math.radians(azim_deg)
    cam.location = (
        TARGET[0] + dist * math.cos(e) * math.sin(a),
        TARGET[1] + dist * math.cos(e) * math.cos(a),
        TARGET[2] + dist * math.sin(e),
    )
    d = mathutils.Vector(TARGET) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

# ---- material appearance (unlit, no glow): Emission = vertex-AO x tint x (1.0 * alpha) ----
# Base Color stays black (lights contribute nothing). The MixRGB (MULTIPLY) node
# multiplies the AO (Color Attribute "Col") by the job tint (Fac B input) and
# feeds the Emission Color. Here we set the tint and the emission strength.
# Emission Strength is 1.0 x alpha so the tint reads as its exact raw file color
# (the in-engine 1.4x emissive gain is a separate knob, applied in sweep/r2b).
def set_body(color, alpha=1.0):
    nt = body_mat.node_tree
    mix  = next(n for n in nt.nodes if n.type == "MIX_RGB")
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    # Emission Color = AO (Color1) * job tint (Color2), mixed at Fac=1.0 (pure multiply)
    mix.inputs["Color2"].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs["Emission Strength"].default_value = 1.0 * alpha
    body_mat.blend_method = "BLEND" if alpha < 1.0 else "OPAQUE"
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha

os.makedirs(out_dir, exist_ok=True)
jobs = []
for name, color in COLORS:
    jobs.append((f"glove-{name}-angle1.png", color, 1.0, ANGLES[0][1], ANGLES[0][2]))
jobs.append((f"glove-theme-blue-angle2.png", COLORS[0][1], 1.0, ANGLES[1][1], ANGLES[1][2]))
jobs.append((f"glove-theme-blue-angle2b.png", COLORS[0][1], 1.0, ANGLES[2][1], ANGLES[2][2]))
jobs.append((f"glove-dimmed-theme-blue.png", COLORS[0][1], DIM, ANGLES[0][1], ANGLES[0][2]))

if _jobs_limit is not None:
    jobs = jobs[:_jobs_limit]

for fname, color, alpha, elev, azim in jobs:
    place_cam(elev, azim)
    final_path = os.path.join(out_dir, fname)
    set_body(color, alpha)
    grid.hide_render = False
    scene.render.film_transparent = False
    scene.render.filepath = final_path
    bpy.ops.render.render(write_still=True)
    print(f"[render-glove] {fname} elev={elev} azim={azim} alpha={alpha}")
print("[render-glove] DONE")
