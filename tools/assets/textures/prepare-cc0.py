"""Run through Blender MCP 9878. Download only the eight approved CC0 photo sets.
Intermediates stay in this checkout's ignored tmp directory; no scene edits.
"""
import bpy, pathlib, json, hashlib, sys, numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[3]
TEMP = ROOT / 'tmp/gfx-p2'
TEMP.mkdir(parents=True, exist_ok=True)
SETS = ['forest_floor', 'grass_ground', 'river_small_rocks', 'sand_01',
        'rock_face', 'stony_dirt_path', 'asphalt_02', 'pine_bark']
# High keeps the close-up forest/stone/bark at 2K. Broad, distant surfaces
# occupy real 1K cells, rather than being upscaled into wasteful 2K cells.
# Coordinates are in 1K units in an 8 x 3 atlas (the final four cells are spare).
HIGH_LAYOUT = [(0, 0, 2), (0, 2, 1), (2, 0, 2), (1, 2, 1),
               (4, 0, 2), (2, 2, 1), (3, 2, 1), (6, 0, 2)]
records = []
cached = '--cached' in sys.argv
if cached:
    records = json.loads((TEMP / 'sources.json').read_text(encoding='utf8'))
    for record in records:
        for source in record['maps'].values():
            if hashlib.sha256((TEMP / source['file']).read_bytes()).hexdigest() != source['sha256']:
                raise ValueError('Cached source checksum mismatch: ' + source['file'])
else:
    import addon
for slug in ([] if cached else SETS):
    info = addon._polyhaven_asset_record(slug)
    files = addon._polyhaven_api_get('files/' + slug, cache=True)
    record = dict(id=slug, source='https://polyhaven.com/a/' + slug,
                  license='CC0-1.0', authors=info.get('authors', {}), maps={})
    for channel in ['diff', 'nor_gl', 'rough']:
        key = next(k for k in files if k.lower() in ({'diff', 'diffuse', 'col'} if channel == 'diff' else {channel, 'roughness'} if channel == 'rough' else {channel}))
        choices = files[key]['2k']
        fmt = 'jpg' if 'jpg' in choices else 'png'
        meta = choices[fmt]
        target = TEMP / (slug + '-' + channel + '.' + fmt)
        if not target.exists():
            addon._polyhaven_download(meta, str(target))
        record['maps'][channel] = dict(file=target.name, url=meta['url'],
            sha256=hashlib.sha256(target.read_bytes()).hexdigest())
    records.append(record)
    print('downloaded', slug)
(TEMP / 'sources.json').write_text(json.dumps(records, indent=2), encoding='utf8')

def load(record, channel, size):
    image = bpy.data.images.load(str(TEMP / record['maps'][channel]['file']), check_existing=False)
    # Read source bytes as data; albedo remains sRGB until decoded by the GPU.
    image.colorspace_settings.name = 'Non-Color'
    image.scale(size, size)
    pixels = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape((size, size, 4))

for size in [512, 1024, 2048]:
    for kind in ['color', 'surface']:
        height = 3072 if size == 2048 else size * 2
        atlas = np.ones((height, size * 4, 4), dtype=np.float32)
        for index, record in enumerate(records):
            if size == 2048:
                col, row, span = HIGH_LAYOUT[index]
                tile_size, left, bottom = span * 1024, col * 1024, row * 1024
            else:
                row, col = divmod(index, 4)
                tile_size, left, bottom = size, col * size, row * size
            if kind == 'color':
                tile = load(record, 'diff', tile_size)
                # Retain real photographic hue/relief, with a restrained palette wash at runtime.
                mean = np.maximum(tile[:, :, :3].mean(axis=(0, 1)), 0.02)
                tile[:, :, :3] = np.clip(tile[:, :, :3] * (0.68 / mean), 0, 1)
            else:
                tile = load(record, 'nor_gl', tile_size)
                tile[:, :, 2] = load(record, 'rough', tile_size)[:, :, 0]
            atlas[bottom:bottom+tile_size, left:left+tile_size] = tile
        image = bpy.data.images.new('gfx-p2-atlas', width=size*4, height=height, alpha=False)
        image.colorspace_settings.name = 'Non-Color'
        image.pixels.foreach_set(atlas.ravel())
        image.filepath_raw = str(TEMP / f'{kind}-{size}.png')
        image.file_format = 'PNG'
        image.save()
        bpy.data.images.remove(image)
        print('atlas', kind, size)
print('GFX-P2 photographic atlases ready')
