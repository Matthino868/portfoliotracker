// pages/_document.tsx
import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* External stylesheet should be added here */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/monzanifabio/cryptofont/cryptofont.css"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
