"""HR-CHAR probe: read-only diagnostics of the CC0 inputs (no export).

blender -b --factory-startup -P tools/assets/blender/hr-char-probe.py -- <src-dir>
"""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("hr_char", os.path.join(HERE, "hr-char.py"))
hr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hr)


def main(src):
    mh, clos, world, joints, rig = hr.assemble(src)
    report = {"joints": {k: [round(x, 3) for x in joints[k]] for k in (
        "upper-leg" if False else "l-upper-leg", "l-knee", "l-ankle", "l-shoulder", "l-elbow", "l-hand",
        "l-clavicle", "neck", "head", "head-2", "pelvis", "spine-1", "spine-2", "spine-3", "spine-4")}}
    for key in ("suit", "eyes", "hair", "shoes"):
        verts, uvs, faces = hr.read_obj(clos[key]["obj"])
        obj, _ = hr.make_object(key, world[key], faces, uvs)
        comps = hr.components(obj.data)
        info = []
        for c in sorted(comps, key=len, reverse=True)[:12]:
            zs = [obj.data.vertices[i].co.z for i in c]
            xs = [obj.data.vertices[i].co.x for i in c]
            info.append({"n": len(c), "z": [round(min(zs), 3), round(max(zs), 3)], "x": [round(min(xs), 3), round(max(xs), 3)]})
        report[key] = {"verts": len(obj.data.vertices), "refs": len(clos[key]["refs"]), "components": len(comps), "big": info,
                       "delete": len(clos[key]["delete"])}
    print("PROBE", json.dumps(report))


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1])
