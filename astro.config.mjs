// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

import netlify from '@astrojs/netlify';
import node from '@astrojs/node';

// DEPLOY_TARGET=pi 로 빌드하면 라즈베리 파이 등 자체 서버용(Node) 빌드가 된다.
const isPi = process.env.DEPLOY_TARGET === 'pi';

// 글 관련 페이지를 요청 시 렌더링으로 전환하는 훅.
// - 개발 서버: /create 로 만든 글이 즉시 보이도록
// - 자체 서버(pi): 발행 즉시 반영되고 재빌드가 필요 없도록
// Netlify 빌드에서는 전부 정적 페이지로 만든다.
const livePosts = {
  name: 'live-posts',
  hooks: {
    'astro:route:setup': ({ route, command }) => {
      if (
        (command === 'dev' || isPi) &&
        (route.component.endsWith('/pages/[num].astro') ||
          route.component.endsWith('/pages/edit/[num].astro') ||
          route.component.endsWith('/pages/blog/index.astro') ||
          route.component.endsWith('/pages/create.astro') ||
          route.component.endsWith('/pages/rss.xml.js'))
      ) {
        route.prerender = false;
      }
    },
  },
};

// https://astro.build/config
export default defineConfig({
  site: 'https://example.com',
  integrations: [mdx(), sitemap(), livePosts],

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

  // 파이는 Tailscale Funnel이 HTTPS를 받아 HTTP로 넘겨주므로 origin 검사(CSRF)가
  // 항상 실패해 폼 발행이 403으로 막힌다. 발행은 비밀번호로 보호되므로 꺼도 안전.
  security: { checkOrigin: !isPi },

  adapter: isPi ? node({ mode: 'standalone' }) : netlify(),
});