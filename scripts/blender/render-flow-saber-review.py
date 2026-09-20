# Headless Blender review renders for the flow-saber model (Derrick's visual sign-off loop).
#
# Usage (headless):
#   blender -b --python scripts/blender/render-flow-saber-review.py -- \
#     /abs/path/to/flow-saber-v1.glb /abs/path/to/output-dir
#
# Produces 1280x720 angled product renders (dark background + grid floor + area light):
#   4 blade colors at angle1, theme-blue at angle2 + angle2b, and one dimmed variant.
# The glow is approximated in-scene with an additive halo matched to the in-engine
# parameters (radius 0.045 WU, blade tint x gain 0.6) — the runtime glow itself is
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

# ---- glow halo (translucent emissive, around the BLADE section only) ----
# The saber runs along local +Y; a primitive cylinder's axis is local +Z, so
# rotate 90deg about X to align the halo with the blade.
bpy.ops.mesh.primitive_cylinder_add(radius=GLOW_RADIUS, depth=GLOW_LENGTH, vertices=24,
                                    location=(0, GLOW_CENTER_Y, 0),
                                    rotation=(math.radians(90), 0, 0))
glow = bpy.context.active_object
glow.name = "saber_glow"
glow_mat = bpy.data.materials.new("saber_glow_mat")
glow_mat.use_nodes = True
nt = glow_mat.node_tree
nt.nodes.clear()
out_node = nt.nodes.new("ShaderNodeOutputMaterial")
emis = nt.nodes.new("ShaderNodeEmission")
emis.name = "Emission"
emis.inputs["Strength"].default_value = 1.6
transp = nt.nodes.new("ShaderNodeBsdfTransparent")
mix = nt.nodes.new("ShaderNodeMixShader")
mix.inputs["Fac"].default_value = 0.45   # additive-ish halo strength (EEVEE 4.0 has no ADD blend)
nt.links.new(emis.outputs["Emission"], mix.inputs[1])
nt.links.new(transp.outputs["BSDF"], mix.inputs[2])
nt.links.new(mix.outputs["Shader"], out_node.inputs["Surface"])
glow_mat.blend_method = "BLEND"
glow_mat.shadow_method = "NONE"
glow.data.materials.append(glow_mat)

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

def set_blade(color, alpha=1.0):
    if blade_mat.use_nodes:
        bsdf = blade_mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (color[0], color[1], color[2], 1.0)
                bsdf.inputs["Emission Strength"].default_value = 0.85
            blade_mat.blend_method = "BLEND" if alpha < 1.0 else "OPAQUE"
            if "Alpha" in bsdf.inputs:
                bsdf.inputs["Alpha"].default_value = alpha
    emis = glow_mat.node_tree.nodes.get("Emission")
    if emis:
        emis.inputs["Color"].default_value = (color[0] * GLOW_GAIN, color[1] * GLOW_GAIN, color[2] * GLOW_GAIN, 1.0)
        emis.inputs["Strength"].default_value = 1.6

os.makedirs(out_dir, exist_ok=True)
jobs = []
for name, color in COLORS:
    jobs.append((f"r2-saber-{name}-angle1.png", color, 1.0, ANGLES[0][1], ANGLES[0][2]))
jobs.append((f"r2-saber-theme-blue-angle2.png", COLORS[0][1], 1.0, ANGLES[1][1], ANGLES[1][2]))
jobs.append((f"r2-saber-theme-blue-angle2b.png", COLORS[0][1], 1.0, ANGLES[2][1], ANGLES[2][2]))
jobs.append((f"r2-saber-dimmed-theme-blue.png", COLORS[0][1], DIM, ANGLES[0][1], ANGLES[0][2]))

for fname, color, alpha, elev, azim in jobs:
    set_blade(color, alpha)
    glow_mat.node_tree.nodes["Emission"].inputs["Strength"].default_value = 1.6 * alpha
    place_cam(elev, azim)
    scene.render.filepath = os.path.join(out_dir, fname)
    bpy.ops.render.render(write_still=True)
    print(f"[render-saber] {fname} elev={elev} azim={azim} alpha={alpha}")
print("[render-saber] DONE")
