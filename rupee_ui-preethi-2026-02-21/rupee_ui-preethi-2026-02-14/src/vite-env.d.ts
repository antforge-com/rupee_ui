/// <reference types="vite/client" />

declare const __API_BASE__: string;

declare module '*.module.css' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.css' {
  const content: string;
  export default content;
}