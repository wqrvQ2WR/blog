import fs from 'node:fs/promises';
import path from 'node:path';

const IMAGE_DIR = path.join(process.cwd(), 'public/images');

// 겹치지 않는 새 이미지 파일 이름을 만든다.
export function newImageName(original: string): string {
	const ext = (path.extname(original) || '.png').toLowerCase();
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
}

// (개발 서버 전용) 이미지를 public/images/ 에 저장한다.
export async function saveImageBuffer(name: string, data: Buffer): Promise<void> {
	await fs.mkdir(IMAGE_DIR, { recursive: true });
	await fs.writeFile(path.join(IMAGE_DIR, name), data);
}
