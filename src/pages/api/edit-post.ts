export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { commitFiles, type FileToCommit } from '../../lib/github';
import { newImageName, saveImageBuffer } from '../../lib/images';
import { getLivePosts } from '../../lib/posts';

const BLOG_DIR = path.join(process.cwd(), 'src/content/blog');
const IMAGE_DIR = path.join(process.cwd(), 'public/images');

function isImageFile(v: FormDataEntryValue | null): v is File {
	return v instanceof File && v.size > 0 && v.type.startsWith('image/');
}

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
	const title = String(form.get('title') ?? '').trim();
	const description = String(form.get('description') ?? '').trim();
	const category = String(form.get('category') ?? '').trim();
	const body = String(form.get('body') ?? '').trim();

	// 파일 이름만 허용 (경로 조작 방지)
	if (!/^[\w.-]+\.(md|mdx)$/i.test(file) || file.includes('..')) {
		return new Response('잘못된 요청입니다.', { status: 400 });
	}
	if (!title || !body) {
		return new Response('제목과 본문을 입력해주세요.', { status: 400 });
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

	// 새로 첨부한 이미지는 (첨부:N) 자리표시자로 본문에 들어간다. 실제 저장은 아래
	// 분기(로컬 디스크 vs GitHub 커밋)에서 각자 방식으로 처리한다.
	const bodyImages = form.getAll('images').filter(isImageFile);
	const imageEntries = bodyImages.map((f) => ({ file: f, url: `/images/${newImageName(f.name)}` }));
	let finalBody = body;
	imageEntries.forEach((entry, i) => {
		finalBody = finalBody.split(`(첨부:${i + 1})`).join(`(${entry.url})`);
	});

	// 대표 이미지: 새로 올리면 교체, '삭제' 체크하면 제거, 아니면 기존 유지
	const hero = form.get('hero');
	let heroUrl = post.heroImage;
	if (isImageFile(hero)) {
		heroUrl = `/images/${newImageName(hero.name)}`;
	} else if (form.get('removeHero') === '1') {
		heroUrl = undefined;
	}

	// pubDate는 유지해 글 번호가 바뀌지 않게 하고, updatedDate만 갱신한다.
	const markdown = [
		'---',
		`title: ${JSON.stringify(title)}`,
		`description: ${JSON.stringify(description || title)}`,
		`pubDate: ${JSON.stringify(post.pubDate.toISOString())}`,
		`updatedDate: ${JSON.stringify(new Date().toISOString())}`,
		...(heroUrl ? [`heroImage: ${JSON.stringify(heroUrl)}`] : []),
		...(category ? [`category: ${JSON.stringify(category)}`] : []),
		'---',
		'',
		finalBody,
		'',
	].join('\n');

	// Vercel 등 서버리스: GitHub에 커밋 → 자동 재배포 (1~2분 뒤 반영)
	if (import.meta.env.PROD && process.env.BLOG_LOCAL_PUBLISH !== '1') {
		const token = process.env.BLOG_GITHUB_TOKEN;
		const repo = process.env.BLOG_REPO || 'wqrvQ2WR/blog';
		if (!token) {
			return new Response('서버에 BLOG_GITHUB_TOKEN 환경변수가 설정되지 않았습니다.', { status: 500 });
		}
		const files: FileToCommit[] = [{ path: `src/content/blog/${post.file}`, content: markdown }];
		for (const entry of imageEntries) {
			files.push({ path: `public${entry.url}`, content: Buffer.from(await entry.file.arrayBuffer()) });
		}
		if (isImageFile(hero)) {
			files.push({ path: `public${heroUrl}`, content: Buffer.from(await hero.arrayBuffer()) });
		}
		// ponytail: 서버리스 경로에서는 더 안 쓰는 업로드 이미지 정리는 생략 (남아도 저장소 용량만 조금 씀). 필요해지면 로컬 경로처럼 uploadedImages diff로 delete 처리 추가.
		await commitFiles(repo, token, `글 수정: ${title}`, files);
		return new Response(
			`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="refresh" content="90;url=/${post.num}"></head><body style="font-family:sans-serif;max-width:32em;margin:15vh auto;padding:0 1em;line-height:1.7;text-align:center"><h1>수정 완료!</h1><p>1~2분 뒤 <a href="/${post.num}">/${post.num}</a>에서 확인할 수 있어요.</p></body></html>`,
			{ headers: { 'Content-Type': 'text/html; charset=utf-8' } },
		);
	}

	for (const entry of imageEntries) {
		await saveImageBuffer(path.basename(entry.url), Buffer.from(await entry.file.arrayBuffer()));
	}
	if (isImageFile(hero) && heroUrl) {
		await saveImageBuffer(path.basename(heroUrl), Buffer.from(await hero.arrayBuffer()));
	}

	await fs.writeFile(path.join(BLOG_DIR, post.file), markdown, 'utf8');

	// 수정으로 더는 안 쓰게 된 업로드 이미지 정리 (다른 글이 쓰면 남김)
	const stillUsed = new Set([
		...uploadedImages(finalBody, heroUrl),
		...posts.filter((p) => p.file !== post.file).flatMap((p) => uploadedImages(p.body, p.heroImage)),
	]);
	for (const name of uploadedImages(post.body, post.heroImage)) {
		if (stillUsed.has(name)) continue;
		await fs.unlink(path.join(IMAGE_DIR, name)).catch(() => {});
	}

	return redirect(`/${post.num}`, 303);
};
