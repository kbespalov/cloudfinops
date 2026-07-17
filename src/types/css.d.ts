declare module '*.css';
declare module '*.module.css' {
  const classes: {readonly [key: string]: string};
  export default classes;
}

/** Side-effect CSS entry exposed via package exports without a `.css` suffix. */
declare module '@gravity-ui/aikit/styles';
