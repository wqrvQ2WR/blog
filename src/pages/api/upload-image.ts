export const prerender = false;

import type { APIRoute } from 'astro';
import { saveImage } from '../../lib/images';

export const POST: APIRoute = async ({ request }) => {
	if (import.meta.env.PROD) {
		return new Response('배포된 사이트에서는 업로드할 수 없습니다.', { status: 403 });
	}

	const form = await request.formData();
	const file = form.get('image');
	if (!(file instanceof File) || file.size === 0) {
		return new Response('이미지 파일이 없습니다.', { status: 400 });
	}
	if (!file.type.startsWith('image/')) {
		return new Response('이미지 파일만 올릴 수 있습니다.', { status: 400 });
	}

	const url = await saveImage(file);
	return new Response(JSON.stringify({ url }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
