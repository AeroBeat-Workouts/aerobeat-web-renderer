# Parametric low-poly boxing glove (AeroBeat 0.0.62 L-D, bead 5y0q, round 1).
#
# Usage (headless):
#   blender -b --python scripts/blender/build-boxing-glove-v1.py -- /abs/out/boxing-glove-v1.glb
#
# Local frame (left-hand convention): +X = thumb side, +Y = up, +Z = grid-facing
# (knuckles face +Z). Origin = the wrist sample point. The glove must sit WITHIN
# the detection box (0.68 x 0.56 x 0.68 WU total) — what-you-see-is-what-hits.
#
# Shape: rounded fist (UV sphere) + thumb (smaller UV sphere, +X) + short cuff
# band toward -Y. ONE material slot (mat/glove_body, runtime-tintable per hand).
# Shading: vertex-color AO (COLOR_0) darkening the thumb junction + cuff inner
# edge — the in-engine material is unlit, so the baked depth is what makes it
# read as a shaded glove while staying fully tintable. No textures.

import sys, os, math

_args = sys.argv
out_path = _args[_args.index("--") + 1] if "--" in _args else "boxing-glove-v1.glb"

import bpy
import mathutils

# ---- clean scene ----
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
    for block in list(coll):
        if block.users == 0:
            coll.remove(block)

def make_sphere(name, segments, rings, scale, location):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0, location=location)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return o

# ---- dims (tune here; must keep overall extents <= ~0.58 x 0.50 x 0.48) ----
BODY_SCALE = (0.26, 0.20, 0.23)          # fist
THUMB_SCALE = (0.09, 0.10, 0.11)
THUMB_CENTER = (0.20, -0.03, -0.04)
CUFF_RADIUS = 0.15
CUFF_DEPTH = 0.12
CUFF_Y = -0.20

body = make_sphere("glove_body", 16, 8, BODY_SCALE, (0, 0, 0))
thumb = make_sphere("glove_thumb", 12, 6, THUMB_SCALE, THUMB_CENTER)
bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=CUFF_RADIUS, depth=CUFF_DEPTH,
                                    location=(0, CUFF_Y, 0), rotation=(math.radians(90), 0, 0))
cuff = bpy.context.active_object
cuff.name = "glove_cuff"
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

for o in (body, thumb, cuff):
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
glove = bpy.context.active_object
glove.name = "boxing-glove-v1"

# recalc normals outward
import bmesh
bm = bmesh.new()
bm.from_mesh(glove.data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(glove.data)
bm.free()

# ---- vertex-color AO (COLOR_0): crevice darkening, stays a multiply over the tint ----
glove.data.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
attr = glove.data.color_attributes[0]
junction = mathutils.Vector(THUMB_CENTER)
cuff_edge_y = CUFF_Y + CUFF_DEPTH / 2   # inner rim of the cuff
for i in range(len(attr.data)):
    v = glove.data.vertices[glove.data.loops[i].vertex_index].co
    shade = 1.0
    d_junc = (v - junction).length
    shade = min(shade, max(0.55, 1.0 - max(0.0, 0.14 - d_junc) * 3.0))
    d_cuff = abs(v.y - cuff_edge_y)
    shade = min(shade, max(0.60, 1.0 - max(0.0, 0.10 - d_cuff) * 2.5))
    attr.data[i].color = (shade, shade, shade, 1.0)

# ---- material: single tintable slot, white base (runtime per-hand tint) ----
mat = bpy.data.materials.new("mat/glove_body")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
bsdf.inputs["Roughness"].default_value = 0.6
glove.data.materials.append(mat)

# ---- smoothing (4.0 uses use_auto_smooth; 4.1+ uses shade_auto_smooth) ----
bpy.ops.object.shade_smooth()
if hasattr(glove.data, "use_auto_smooth"):
    glove.data.use_auto_smooth = True
    glove.data.auto_smooth_angle = math.radians(40)
else:
    bpy.ops.object.shade_auto_smooth(angle=math.radians(40))

# ---- report ----
tris = sum(len(p.vertices) - 2 for p in glove.data.polygons)
xs = [v.co.x for v in glove.data.vertices]
ys = [v.co.y for v in glove.data.vertices]
zs = [v.co.z for v in glove.data.vertices]
print(f"[build-glove] TRIS: {tris}")
print(f"[build-glove] EXTENTS: x={max(xs)-min(xs):.3f} y={max(ys)-min(ys):.3f} z={max(zs)-min(zs):.3f}")
print(f"[build-glove] SPAN: x[{min(xs):.3f},{max(xs):.3f}] y[{min(ys):.3f},{max(ys):.3f}] z[{min(zs):.3f},{max(zs):.3f}]")

os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", use_selection=True,
                          export_apply=True, export_yup=True, export_materials="EXPORT")
print(f"[build-glove] EXPORTED: {out_path}")
