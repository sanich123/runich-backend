declare module '@mapbox/polyline' {
  const polyline: {
    encode(points: number[][]): string;
  };

  export default polyline;
}
