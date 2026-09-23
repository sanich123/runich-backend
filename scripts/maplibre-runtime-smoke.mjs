import maplibre from '@maplibre/maplibre-gl-native';

const map = new maplibre.Map({
  ratio: 1,
  request: (_request, callback) => callback(),
});

try {
  map.load({
    version: 8,
    sources: {},
    layers: [],
  });

  const image = await new Promise((resolve, reject) => {
    map.render(
      { width: 64, height: 64, center: [37.6173, 55.7558], zoom: 10 },
      (error, buffer) => {
        if (error) {
          reject(error);
          return;
        }
        if (!buffer || buffer.byteLength === 0) {
          reject(new Error('MapLibre не вернул буфер изображения'));
          return;
        }
        resolve(buffer);
      },
    );
  });

  if (image.byteLength !== 64 * 64 * 4) {
    throw new Error(`MapLibre вернул неожиданный размер буфера: ${image.byteLength}`);
  }

  console.log(`MapLibre runtime smoke passed: ${image.byteLength} bytes`);
} finally {
  map.release();
}
