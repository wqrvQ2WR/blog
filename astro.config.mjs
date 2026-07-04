// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

import netlify from '@astrojs/netlify';

// 개발 서버에서는 글 페이지를 요청 시 렌더링해서(/create 로 만든 글 즉시 반영),
// 배포 빌드에서는 전부 정적 페이지로 만든다.
const devLivePosts = {
  name: 'dev-live-posts',
  hooks: {
    'astro:route:setup': ({ route, command }) => {
      if (
        command === 'dev' &&
        (route.component.endsWith('/pages/[num].astro') ||
          route.component.endsWith('/pages/blog/index.astro'))
      ) {
        route.prerender = false;
      }
    },
  },
};

// https://astro.build/config
export default defineConfig({
  site: 'https://example.com',
  integrations: [mdx(), sitemap(), devLivePosts],

  fonts: [
      {
          provider: fontProviders.local(),
          name: 'Atkinson',
          cssVariable: '--font-atkinson',
          fallbacks: ['sans-serif'],
          options: {
              variants: [
                  {
                      src: ['./src/assets/fonts/atkinson-regular.woff'],
                      weight: 400,
                      style: 'normal',
                      display: 'swap',
                  },
                  {
                      src: ['./src/assets/fonts/atkinson-bold.woff'],
                      weight: 700,
                      style: 'normal',
                      display: 'swap',
                  },
              ],
          },
      },
	],

  adapter: netlify(),
});