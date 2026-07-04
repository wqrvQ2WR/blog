export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { saveImage } from '../../lib/images';
import { getLivePosts } from '../../lib/posts';

const BLOG_DIR = path.join(process.cwd(), 'src/content/blog');

async function exists(p: string) {
	return fs.access(p).then(
		() => true,
		() => false,
	);
}

export const POST: APIRoute = async ({ request, redirect }) => {
	// Netlify 같은 배포 환경은 파일 시스템에 쓸 수 없다.
	// 글 작성은 로컬 개발 서버에서 하고, 커밋/배포로 반영한다.
	if (import.meta.env.PROD) {
		return new Response('배포된 사이트에서는 글을 쓸 수 없습니다. 로컬에서 작성한 뒤 다시 배포해주세요.', {
			status: 403,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' },
		});
	}

	const form = await request.formData();
	const title = String(form.get('title') ?? '').trim();
	const description = String(form.get('description') ?? '').trim();
	const body = String(form.get('body') ?? '').trim();

	if (!title || !body) {
		return new Response('제목과 본문을 입력해주세요.', { status: 400 });
	}

	const hero = form.get('hero');
	const heroUrl =
		hero instanceof File && hero.size > 0 && hero.type.startsWith('image/')
			? await saveImage(hero)
			: undefined;

	const posts = await getLivePosts();
	const nextNum = posts.length + 1;

	let n = nextNum;
	while (await exists(path.join(BLOG_DIR, `post-${n}.md`))) n++;

	const frontmatter = [
		'---',
		`title: ${JSON.stringify(title)}`,
		`description: ${JSON.stringify(description || title)}`,
		`pubDate: ${JSON.stringify(new Date().toISOString())}`,
		...(heroUrl ? [`heroImage: ${JSON.stringify(heroUrl)}`] : []),
		'---',
	].join('\n');

	await fs.writeFile(path.join(BLOG_DIR, `post-${n}.md`), `${frontmatter}\n\n${body}\n`, 'utf8');

	return redirect(`/${nextNum}`, 303);
};
