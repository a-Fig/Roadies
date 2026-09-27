// Image imports resolve to URLs through Remotion's webpack config.
declare module '*.png' {
  const src: string;
  export default src;
}
