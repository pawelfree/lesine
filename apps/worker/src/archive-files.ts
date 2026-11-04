import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { Pool } from 'pg';

type FileRef = { relative_path: string; sha256: string };
type Bundle = { version: 1; database_sha256: string; files: FileRef[] };
const filePattern = /^(import|catalog)\/([a-f0-9]{64})\.json$/;
const hashPattern = /^[a-f0-9]{64}$/;
export const responseRoot = (): string => resolve(process.env.LESINE_RESPONSE_DIR ?? '/data/provider-responses');
async function hashFile(path: string): Promise<string> {
  if (!(await lstat(path)).isFile()) throw new Error('archive_file_not_regular');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function checkedPath(root: string, ref: FileRef): string {
  const match = filePattern.exec(ref.relative_path);
  if (!match || match[2] !== ref.sha256 || !hashPattern.test(ref.sha256)) throw new Error('archive_path_invalid');
  return resolve(root, ref.relative_path);
}

async function checkedCopy(sourceRoot: string, targetRoot: string, ref: FileRef): Promise<void> {
  const source = checkedPath(sourceRoot, ref);
  const target = checkedPath(targetRoot, ref);
  if (await hashFile(source) !== ref.sha256) throw new Error(`archive_file_corrupt: ${ref.relative_path}`);
  await mkdir(resolve(target, '..'), { recursive: true, mode: 0o700 });
  await copyFile(source, target);
  if (await hashFile(target) !== ref.sha256) throw new Error(`archive_copy_corrupt: ${ref.relative_path}`);
}

export async function referencedFiles(pool: Pool): Promise<FileRef[]> {
  const result = await pool.query<FileRef>(
    `SELECT DISTINCT relative_path, sha256 FROM raw_file_manifests
     UNION SELECT DISTINCT 'catalog/' || response_sha256 || '.json', response_sha256
       FROM catalog_probes WHERE response_sha256 IS NOT NULL
     UNION SELECT DISTINCT 'catalog/' || response_sha256 || '.json', response_sha256
       FROM source_depth_samples WHERE response_sha256 IS NOT NULL`,
  );
  return result.rows.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
}

export async function verifyArchive(pool: Pool, quarantineOrphans = false): Promise<{ files: number; legacyChunks: number }> {
  const files = await referencedFiles(pool);
  for (const ref of files) {
    if (await hashFile(checkedPath(responseRoot(), ref)) !== ref.sha256) {
      throw new Error(`archive_file_corrupt: ${ref.relative_path}`);
    }
  }
  const legacy = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM import_chunks WHERE status = 'done' AND manifest_id IS NULL",
  );
  if (quarantineOrphans) {
    const directory = resolve(responseRoot(), 'import');
    const committed = new Set(files.filter((ref) => ref.relative_path.startsWith('import/'))
      .map((ref) => basename(ref.relative_path)));
    const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const name of names) {
      if (!/^[a-f0-9]{64}\.json$/.test(name) || committed.has(name)) continue;
      const source = resolve(directory, name);
      if (Date.now() - (await stat(source)).mtimeMs < 600_000) continue;
      const quarantine = resolve(responseRoot(), 'quarantine');
      await mkdir(quarantine, { recursive: true, mode: 0o700 });
      await rename(source, resolve(quarantine, `${name}.${randomUUID()}`));
    }
  }
  return { files: files.length, legacyChunks: Number(legacy.rows[0]?.count ?? 0) };
}

export async function exportBundle(pool: Pool, bundleRoot: string): Promise<void> {
  await verifyArchive(pool);
  const files = await referencedFiles(pool);
  for (const ref of files) await checkedCopy(responseRoot(), resolve(bundleRoot, 'responses'), ref);
  const database_sha256 = await hashFile(resolve(bundleRoot, 'database.dump'));
  const bundle: Bundle = { version: 1, database_sha256, files };
  await writeFile(resolve(bundleRoot, 'bundle.json'), `${JSON.stringify(bundle, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

export async function verifyBundle(bundleRoot: string): Promise<Bundle> {
  const bundle = JSON.parse(await readFile(resolve(bundleRoot, 'bundle.json'), 'utf8')) as Bundle;
  if (bundle.version !== 1 || !hashPattern.test(bundle.database_sha256) || !Array.isArray(bundle.files)) {
    throw new Error('bundle_manifest_invalid');
  }
  if (await hashFile(resolve(bundleRoot, 'database.dump')) !== bundle.database_sha256) {
    throw new Error('bundle_database_corrupt');
  }
  const unique = new Set<string>();
  for (const ref of bundle.files) {
    checkedPath(responseRoot(), ref);
    if (unique.has(ref.relative_path)) throw new Error('bundle_manifest_invalid');
    unique.add(ref.relative_path);
    if (await hashFile(checkedPath(resolve(bundleRoot, 'responses'), ref)) !== ref.sha256) {
      throw new Error(`bundle_file_corrupt: ${ref.relative_path}`);
    }
  }
  return bundle;
}

export async function restoreFiles(bundleRoot: string): Promise<void> {
  const bundle = await verifyBundle(bundleRoot);
  const existing = await readdir(responseRoot());
  if (existing.length) throw new Error('restore_requires_empty_response_directory');
  for (const ref of bundle.files) await checkedCopy(resolve(bundleRoot, 'responses'), responseRoot(), ref);
}
