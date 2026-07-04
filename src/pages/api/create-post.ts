export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { commitFiles, countPosts, fileExists, type FileToCommit } from '../../lib/github';
import { newImageName, saveImageBuffer } from '../../lib/images';
import { getLivePosts } from '../../lib/posts';

const BLOG_DIR = path.join(process.cwd(), 'src/content/blog');

async function existsLocal(p: string) {
	return fs.access(p).then(
		() => true,
		() => false,
	);
}

function isImageFile(v: FormDataEntryValue | null): v is File {
	return v instanceof File && v.size > 0 && v.type.startsWith('image/');
}

// 발행 완료 안내 페이지 (배포 환경: 재배포가 끝나야 글이 보인다)
function publishedPage(num: number): Response {
	const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>발행 완료</title>
<meta http-equiv="refresh" content="90;url=/${num}">
<style>body{font-family:sans-serif;max-width:32em;margin:15vh auto;padding:0 1em;line-height:1.7;text-align:center}a{color:#2337ff}</style>
</head><body>
<h1>🎉 발행 완료!</h1>
<p>글이 GitHub에 저장됐고, 사이트를 다시 만드는 중입니다.<br><strong>1~2분 뒤</strong> 아래 주소에서 볼 수 있어요.</p>
<p><a href="/${num}">/${num} 글 보러 가기</a> · <a href="/blog">목록으로</a></p>
<p style="color:#888;font-size:.85em">이 페이지는 90초 뒤 자동으로 글로 이동합니다.</p>
</body></html>`;
	return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export const POST: APIRoute = async ({ request, redirect }) => {
	const form = await request.formData();
	const title = String(form.get('title') ?? '').trim();
	const description = String(form.get('description') ?? '').trim();
	const body = String(form.get('body') ?? '').trim();

	if (!title || !body) {
		return new Response('제목과 본문을 입력해주세요.', { status: 400 });
	}

	const hero = form.get('hero');
	const heroFile = isImageFile(hero) ? hero : undefined;
	const bodyImages = form.getAll('images').filter(isImageFile);

	// 본문의 (첨부:N) 자리표시자를 실제 이미지 경로로 바꾼다.
	const imageEntries = bodyImages.map((file) => ({ file, url: `/images/${newImageName(file.name)}` }));
	let finalBody = body;
	imageEntries.forEach((entry, i) => {
		finalBody = finalBody.split(`(첨부:${i + 1})`).join(`(${entry.url})`);
	});

	const heroUrl = heroFile ? `/images/${newImageName(heroFile.name)}` : undefined;

	const makeMarkdown = () =>
		[
			'---',
			`title: ${JSON.stringify(title)}`,
			`description: ${JSON.stringify(description || title)}`,
			`pubDate: ${JSON.stringify(new Date().toISOString())}`,
			...(heroUrl ? [`heroImage: ${JSON.stringify(heroUrl)}`] : []),
			'---',
			'',
			finalBody,
			'',
		].join('\n');

	// ── 배포 환경: GitHub에 커밋 → Netlify가 자동 재배포 ──
	if (import.meta.env.PROD) {
		const token = process.env.BLOG_GITHUB_TOKEN;
		const password = process.env.BLOG_PUBLISH_PASSWORD;
		const repo = process.env.BLOG_REPO || 'wqrvQ2WR/blog';

		if (!token || !password) {
			return new Response(
				'서버에 BLOG_GITHUB_TOKEN / BLOG_PUBLISH_PASSWORD 환경변수가 설정되지 않았습니다.',
				{ status: 500 },
			);
		}
		if (String(form.get('password') ?? '') !== password) {
			return new Response('비밀번호가 틀렸습니다.', { status: 401 });
		}

		const nextNum = (await countPosts(repo, token)) + 1;
		let n = nextNum;
		while (await fileExists(repo, token, `src/content/blog/post-${n}.md`)) n++;

		const files: FileToCommit[] = [
			{ path: `src/content/blog/post-${n}.md`, content: makeMarkdown() },
		];
		if (heroFile && heroUrl) {
			files.push({ path: `public${heroUrl}`, content: Buffer.from(await heroFile.arrayBuffer()) });
		}
		for (const entry of imageEntries) {
			files.push({ path: `public${entry.url}`, content: Buffer.from(await entry.file.arrayBuffer()) });
		}

		await commitFiles(repo, token, `새 글: ${title}`, files);
		return publishedPage(nextNum);
	}

	// ── 개발 서버: 파일에 바로 저장 ──
	if (heroFile && heroUrl) {
		await saveImageBuffer(path.basename(heroUrl), Buffer.from(await heroFile.arrayBuffer()));
	}
	for (const entry of imageEntries) {
		await saveImageBuffer(path.basename(entry.url), Buffer.from(await entry.file.arrayBuffer()));
	}

	const posts = await getLivePosts();
	const nextNum = posts.length + 1;
	let n = nextNum;
	while (await existsLocal(path.join(BLOG_DIR, `post-${n}.md`))) n++;

	await fs.writeFile(path.join(BLOG_DIR, `post-${n}.md`), makeMarkdown(), 'utf8');

	return redirect(`/${nextNum}`, 303);
};
