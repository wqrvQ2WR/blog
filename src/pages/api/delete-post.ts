export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { commitFiles } from '../../lib/github';
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
	}

	const posts = await getLivePosts();
	const post = posts.find((p) => p.file === file);
	if (!post) {
		return new Response('글을 찾을 수 없습니다.', { status: 404 });
	}

	// Vercel 등 서버리스: GitHub에서 파일 삭제 커밋 → 자동 재배포 (1~2분 뒤 반영)
	if (import.meta.env.PROD && process.env.BLOG_LOCAL_PUBLISH !== '1') {
		const token = process.env.BLOG_GITHUB_TOKEN;
		const repo = process.env.BLOG_REPO || 'wqrvQ2WR/blog';
		if (!token) {
			return new Response('서버에 BLOG_GITHUB_TOKEN 환경변수가 설정되지 않았습니다.', { status: 500 });
		}
		// ponytail: 이 글만 쓰던 업로드 이미지 정리는 생략 (create/edit과 동일하게), 필요해지면 uploadedImages diff로 delete 처리 추가.
		await commitFiles(repo, token, `글 삭제: ${post.title}`, [], [`src/content/blog/${post.file}`]);
		return new Response(
			`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="refresh" content="90;url=/blog"></head><body style="font-family:sans-serif;max-width:32em;margin:15vh auto;padding:0 1em;line-height:1.7;text-align:center"><h1>삭제 완료!</h1><p>1~2분 뒤 <a href="/blog">목록</a>에서 사라진 걸 확인할 수 있어요.</p></body></html>`,
			{ headers: { 'Content-Type': 'text/html; charset=utf-8' } },
		);
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
