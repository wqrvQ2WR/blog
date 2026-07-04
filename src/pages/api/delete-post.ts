export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getLivePosts } from '../../lib/posts';

const BLOG_DIR = path.join(process.cwd(), 'src/content/blog');
const IMAGE_DIR = path.join(process.cwd(), 'public/images');

// 본문과 heroImage에서 업로드된 이미지(/images/...) 경로를 뽑아낸다.
function uploadedImages(body: string, heroImage?: string): string[] {
	const names = new Set<string>();
	for (const match of body.matchAll(/\/images\/([\w.-]+)/g)) names.add(match[1]);
	if (heroImage?.startsWith('/images/')) names.add(heroImage.slice('/images/'.length));
	return [...names];
}

export const POST: APIRoute = async ({ request, redirect }) => {
	const form = await request.formData();
	const file = String(form.get('file') ?? '');

	// 파일 이름만 허용 (경로 조작 방지)
	if (!/^[\w.-]+\.(md|mdx)$/i.test(file) || file.includes('..')) {
		return new Response('잘못된 요청입니다.', { status: 400 });
	}

	if (import.meta.env.PROD) {
		const password = process.env.BLOG_PUBLISH_PASSWORD;
		if (!password) {
			return new Response('서버에 BLOG_PUBLISH_PASSWORD 환경변수가 설정되지 않았습니다.', {
				status: 500,
			});
		}
		if (String(form.get('password') ?? '') !== password) {
			return new Response('비밀번호가 틀렸습니다.', { status: 401 });
		}
		if (process.env.BLOG_LOCAL_PUBLISH !== '1') {
			return new Response('이 서버에서는 글 삭제를 지원하지 않습니다.', { status: 501 });
		}
	}

	const posts = await getLivePosts();
	const post = posts.find((p) => p.file === file);
	if (!post) {
		return new Response('글을 찾을 수 없습니다.', { status: 404 });
	}

	await fs.unlink(path.join(BLOG_DIR, post.file));

	// 이 글만 쓰던 업로드 이미지는 같이 지운다. 다른 글이 쓰는 이미지는 남긴다.
	const remaining = posts.filter((p) => p.file !== post.file);
	const stillUsed = new Set(
		remaining.flatMap((p) => uploadedImages(p.body, p.heroImage)),
	);
	for (const name of uploadedImages(post.body, post.heroImage)) {
		if (stillUsed.has(name)) continue;
		await fs.unlink(path.join(IMAGE_DIR, name)).catch(() => {});
	}

	return redirect('/blog', 303);
};
