import bpy, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
MODELS = os.path.join(ROOT, "apps", "sea", "public", "models")
SOURCE = os.path.join(HERE, "coastal-gull.glb")
OLD = os.path.join(HERE, "old-gull.glb")
LENGTH = 0.62
FLY_FACES = 5000
PERCH_FACES = 6000
FLIGHT_DROP = ("leg", "toe", "foot", "folded wing", "primary feather")


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def import_glb(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.context.scene.objects if o not in before]


def join(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def bounds(ob):
    pts = [ob.matrix_world @ v.co for v in ob.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def decimate(ob, faces):
    count = len(ob.data.polygons)
    if count <= faces:
        return
    m = ob.modifiers.new("d", "DECIMATE")
    m.ratio = faces / count
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)


def unparent(objects):
    for o in objects:
        if o.parent:
            world = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = world


def gull_parts(drop):
    objs = import_glb(SOURCE)
    unparent(objs)
    for o in list(objs):
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    parts = [o for o in meshes() if not any(word in o.name.lower() for word in drop)]
    for o in meshes():
        if o not in parts:
            bpy.data.objects.remove(o)
    return join(parts, "gull")


def fit(ob, ground):
    lo, hi = bounds(ob)
    skin = LENGTH / (hi.x - lo.x)
    ob.scale = (skin, skin, skin)
    bpy.ops.object.transform_apply(scale=True)
    lo, hi = bounds(ob)
    cx = (lo.x + hi.x) / 2
    cz = (lo.z + hi.z) / 2
    ob.location = Vector((-cx, -(lo.y + hi.y) / 2, -lo.z if ground else -cz))
    bpy.ops.object.transform_apply(location=True)


def export(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True, use_selection=False, export_draco_mesh_compression_enable=False)


HEAD_PARTS = ("eye", "glint", "iris", "pupil", "bill")
OLD_EYE = Vector((0.25, 0.0, 0.05))
HEAD_SQUEEZE = 0.8


def split_by_material(ob, keep):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    slots = [i for i, m in enumerate(ob.data.materials) if m and m.name.split(".")[0] in keep]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for p in ob.data.polygons:
        p.select = p.material_index not in slots
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="FACE")
    bpy.ops.object.mode_set(mode="OBJECT")


def head_parts():
    objs = import_glb(SOURCE)
    unparent(objs)
    for o in list(objs):
        if o.type != "MESH" or not any(w in o.name.lower() for w in HEAD_PARTS):
            bpy.data.objects.remove(o)
    return meshes()


def flying():
    clear()
    lo, hi = bounds(gull_parts(FLIGHT_DROP))
    scale = LENGTH / (hi.x - lo.x)
    centre = (lo + hi) / 2
    clear()
    parts = head_parts()
    pupils = [o for o in parts if "pupil" in o.name.lower()]
    eye = sum((o.matrix_world @ v.co for o in pupils for v in o.data.vertices), Vector()) / sum(len(o.data.vertices) for o in pupils)
    eye = (eye - centre) * scale
    head = join(parts, "head")
    for v in head.data.vertices:
        c = (v.co - centre) * scale
        v.co = Vector((c.x + OLD_EYE.x - eye.x, c.y * HEAD_SQUEEZE, c.z + OLD_EYE.z - eye.z))
    old_import = import_glb(OLD)
    unparent(old_import)
    old = [o for o in old_import if o.type == "MESH"][0]
    for o in old_import:
        if o is not old:
            bpy.data.objects.remove(o)
    split_by_material(old, ("plumage", "wing", "tail"))
    join([old, head], "gull")
    export(os.path.join(MODELS, "gull.glb"))


def perch():
    clear()
    body = gull_parts(())
    fit(body, ground=True)
    decimate(body, PERCH_FACES)
    export(os.path.join(MODELS, "gull-perch.glb"))


flying()
perch()
