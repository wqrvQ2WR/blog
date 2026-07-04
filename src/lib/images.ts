import fs from 'node:fs/promises';
import path from 'node:path';

const IMAGE_DIR = path.join(process.cwd(), 'public/images');

function safeImageName(original: string): string {
	const ext = (path.extname(original) || '.png').toLowerCase();
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
}

// 업로드된 이미지를 public/images/ 에 저장하고 사이트 기준 URL을 돌려준다.
export async function saveImage(file: File): Promise<string> {
	await fs.mkdir(IMAGE_DIR, { recursive: true });
	const name = safeImageName(file.name);
	await fs.writeFile(path.join(IMAGE_DIR, name), Buffer.from(await file.arrayBuffer()));
	return `/images/${name}`;
}
