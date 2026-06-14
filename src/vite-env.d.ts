declare module '*.ico' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_NETFLIX_PROFILE_NAME?: string;
  readonly VITE_NETFLIX_PROFILE_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
