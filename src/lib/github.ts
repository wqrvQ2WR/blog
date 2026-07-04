// 배포된 사이트에서 발행할 때 GitHub API로 저장소에 직접 커밋한다.
// 커밋이 올라가면 Netlify가 자동으로 재배포한다.

const API = 'https://api.github.com';

export interface FileToCommit {
	path: string; // 저장소 기준 경로 (예: src/content/blog/post-7.md)
	content: string | Buffer; // 문자열은 UTF-8, Buffer는 바이너리(이미지)
}

function headers(token: string) {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};
}

async function gh(token: string, url: string, init?: RequestInit): Promise<any> {
	const res = await fetch(`${API}${url}`, {
		...init,
		headers: { ...headers(token), 'Content-Type': 'application/json', ...init?.headers },
	});
	if (!res.ok) {
		throw new Error(`GitHub API 오류 (${url}): ${res.status} ${await res.text()}`);
	}
	return res.json();
}

// src/content/blog 안의 글 개수 (다음 글 번호 계산용)
export async function countPosts(repo: string, token: string): Promise<number> {
	const items = await gh(token, `/repos/${repo}/contents/src/content/blog`);
	return (items as { name: string }[]).filter((i) => /\.(md|mdx)$/i.test(i.name)).length;
}

export async function fileExists(repo: string, token: string, path: string): Promise<boolean> {
	const res = await fetch(`${API}/repos/${repo}/contents/${path}`, { headers: headers(token) });
	return res.ok;
}

// 여러 파일을 하나의 커밋으로 main 브랜치에 올린다.
export async function commitFiles(
	repo: string,
	token: string,
	message: string,
	files: FileToCommit[],
): Promise<void> {
	const ref = await gh(token, `/repos/${repo}/git/ref/heads/main`);
	const baseSha: string = ref.object.sha;
	const baseCommit = await gh(token, `/repos/${repo}/git/commits/${baseSha}`);

	const tree = await Promise.all(
		files.map(async (file) => {
			if (typeof file.content === 'string') {
				return { path: file.path, mode: '100644', type: 'blob', content: file.content };
			}
			const blob = await gh(token, `/repos/${repo}/git/blobs`, {
				method: 'POST',
				body: JSON.stringify({ content: file.content.toString('base64'), encoding: 'base64' }),
			});
			return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha as string };
		}),
	);

	const newTree = await gh(token, `/repos/${repo}/git/trees`, {
		method: 'POST',
		body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
	});
	const commit = await gh(token, `/repos/${repo}/git/commits`, {
		method: 'POST',
		body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }),
	});
	await gh(token, `/repos/${repo}/git/refs/heads/main`, {
		method: 'PATCH',
		body: JSON.stringify({ sha: commit.sha }),
	});
}
