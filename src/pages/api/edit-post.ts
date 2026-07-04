export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
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
		if (process.env.BLOG_LOCAL_PUBLISH !== '1') {
			return new Response('이 서버에서는 글 수정을 지원하지 않습니다.', { status: 501 });
		}
	}

	const posts = await getLivePosts();
	const post = posts.find((p) => p.file === file);
	if (!post) {
		return new Response('글을 찾을 수 없습니다.', { status: 404 });
	}

	// 새로 첨부한 이미지 저장 + (첨부:N) 자리표시자 치환
	const bodyImages = form.getAll('images').filter(isImageFile);
	const imageEntries = bodyImages.map((f) => ({ file: f, url: `/images/${newImageName(f.name)}` }));
	let finalBody = body;
	imageEntries.forEach((entry, i) => {
		finalBody = finalBody.split(`(첨부:${i + 1})`).join(`(${entry.url})`);
	});
	for (const entry of imageEntries) {
		await saveImageBuffer(path.basename(entry.url), Buffer.from(await entry.file.arrayBuffer()));
	}

	// 대표 이미지: 새로 올리면 교체, '삭제' 체크하면 제거, 아니면 기존 유지
	const hero = form.get('hero');
	let heroUrl = post.heroImage;
	if (isImageFile(hero)) {
		heroUrl = `/images/${newImageName(hero.name)}`;
		await saveImageBuffer(path.basename(heroUrl), Buffer.from(await hero.arrayBuffer()));
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
		'---',
		'',
		finalBody,
		'',
	].join('\n');

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
