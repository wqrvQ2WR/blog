import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const BLOG_DIR = path.join(process.cwd(), 'src/content/blog');

export interface LivePost {
	num: number;
	file: string;
	title: string;
	description: string;
	pubDate: Date;
	updatedDate?: Date;
	heroImage?: string;
	category?: string;
	body: string;
}

// 콘텐츠 스토어 대신 매 요청마다 디스크에서 글을 읽는다.
// 개발 서버 재시작 없이 /create 로 만든 글이 바로 반영되게 하기 위함이다.
export async function getLivePosts(): Promise<LivePost[]> {
	const files = (await fs.readdir(BLOG_DIR)).filter((f) => /\.(md|mdx)$/i.test(f));
	const posts = await Promise.all(
		files.map(async (file) => {
			const raw = await fs.readFile(path.join(BLOG_DIR, file), 'utf8');
			const { data, content } = matter(raw);
			return {
				num: 0,
				file,
				title: String(data.title ?? file),
				description: String(data.description ?? ''),
				pubDate: new Date(data.pubDate),
				updatedDate: data.updatedDate ? new Date(data.updatedDate) : undefined,
				heroImage: data.heroImage ? String(data.heroImage) : undefined,
				category: data.category ? String(data.category) : undefined,
				body: content,
			};
		}),
	);
	posts.sort((a, b) => a.pubDate.valueOf() - b.pubDate.valueOf() || a.file.localeCompare(b.file));
	return posts.map((p, i) => ({ ...p, num: i + 1 }));
}

// 유튜브·치지직 URL을 임베드 플레이어 주소로 변환한다. 대상이 아니면 undefined.
function embedUrl(url: string): string | undefined {
	const youtube =
		url.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?v=([\w-]{6,})/) ||
		url.match(/^https?:\/\/youtu\.be\/([\w-]{6,})/) ||
		url.match(/^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([\w-]{6,})/);
	if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`;

	const chzzkClip = url.match(/^https?:\/\/chzzk\.naver\.com\/(?:embed\/clip|clips)\/([\w-]+)/);
	if (chzzkClip) return `https://chzzk.naver.com/embed/clip/${chzzkClip[1]}`;

	const chzzk = url.match(/^https?:\/\/chzzk\.naver\.com\/(?:live|video)\/[\w-]+/);
	if (chzzk) return url;

	return undefined;
}

// 한 줄에 URL만 달랑 있으면 iframe 임베드로 바꾼다.
function applyEmbeds(markdown: string): string {
	return markdown
		.split('\n')
		.map((line) => {
			const url = line.trim();
			const src = embedUrl(url);
			if (!src) return line;
			return `<div class="embed"><iframe src="${src}" title="임베드된 영상" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
		})
		.join('\n');
}

export function renderPostHtml(post: LivePost): string {
	// MDX의 import/export 구문은 일반 마크다운 렌더러가 모르므로 제거한다.
	const body = post.file.endsWith('.mdx')
		? post.body.replace(/^(import|export)\s.*$/gm, '')
		: post.body;
	// breaks: 본문에서 엔터 한 번도 줄바꿈으로 보이게 한다.
	return marked.parse(applyEmbeds(body), { async: false, breaks: true }) as string;
}
