import type { APIRoute } from 'astro';
import { getLivePosts } from '../lib/posts';

// 클라이언트 검색용 인덱스. 제목·설명·본문을 그대로 내려주고
// 매칭은 브라우저에서 한다. (글 수가 적어 전체 전송으로 충분)
export const GET: APIRoute = async () => {
	const posts = await getLivePosts();
	const index = posts.map((p) => ({
		num: p.num,
		title: p.title,
		description: p.description,
		body: p.body,
	}));
	return new Response(JSON.stringify(index), {
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
