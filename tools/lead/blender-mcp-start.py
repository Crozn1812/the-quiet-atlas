# Started by tools/lead/blender-workers.sh: one Blender per worker, MCP server on BLENDER_WORKER_PORT.
import os, bpy, addon_utils
port = int(os.environ.get("BLENDER_WORKER_PORT", "9876"))
addon_utils.enable("addon", default_set=True)
try:
    bpy.context.scene.blendermcp_port = port
except Exception:
    pass
def boot():
    s = bpy.context.scene
    s.blendermcp_port = port
    if hasattr(s, "blendermcp_use_polyhaven"): s.blendermcp_use_polyhaven = True
    import addon
    server = getattr(bpy.types, "blendermcp_server", None)
    if server is not None and server.running and server.port != port:
        server.stop()          # the add-on auto-started on its default port first
        server = None
    if server is None:
        server = addon.BlenderMCPServer(host="127.0.0.1", port=port)
        bpy.types.blendermcp_server = server
    if not server.running:
        server.start()
    print(f"BlenderMCP worker listening on {server.port}")
    return None
bpy.app.timers.register(boot, first_interval=3.0)
