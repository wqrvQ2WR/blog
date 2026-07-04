export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';

// 자체 서버에서 발행 시 새로 올라온 이미지는 빌드 결과물(dist)에 없으므로
// public/images/ 에서 직접 읽어 서빙한다. 빌드에 포함된 이미지는 정적 파일이 우선한다.
const IMAGE_DIR = path.join(process.cwd(), 'public/images');

const MIME: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.avif': 'image/avif',
};

export const GET: APIRoute = async ({ params }) => {
	const file = params.file ?? '';
	const full = path.resolve(IMAGE_DIR, file);
	if (!full.startsWith(IMAGE_DIR + path.sep)) {
		return new Response('잘못된 경로입니다.', { status: 400 });
	}

	try {
		const data = await fs.readFile(full);
		const type = MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream';
		return new Response(data, {
			headers: {
				'Content-Type': type,
				'Cache-Control': 'public, max-age=31536000, immutable',
			},
		});
	} catch {
		return new Response('이미지를 찾을 수 없습니다.', { status: 404 });
	}
};
