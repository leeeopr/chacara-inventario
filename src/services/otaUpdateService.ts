import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  AppInfo,
  AppUpdaterPluginInterface,
  DownloadProgress,
  UpdateInfo,
} from '../types/ota';

const AppUpdater = registerPlugin<AppUpdaterPluginInterface>('AppUpdater');

const DEFAULT_REPO = 'leeeopr/chacara-inventario';
const LOCAL_STORAGE_KEY = 'OTA_GITHUB_REPO';

/**
 * Get configured GitHub repository in owner/repo format.
 */
export function getOtaRepo(): string {
  try {
    const custom = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (custom && custom.trim()) {
      return custom.trim();
    }
  } catch {
    // Ignore localStorage errors
  }
  const envRepo = (import.meta as any).env?.VITE_GITHUB_REPO;
  if (envRepo && typeof envRepo === 'string' && envRepo.trim()) {
    return envRepo.trim();
  }
  return DEFAULT_REPO;
}

/**
 * Set custom GitHub repository in owner/repo format.
 */
export function setOtaRepo(repo: string): void {
  try {
    if (!repo || !repo.trim()) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } else {
      localStorage.setItem(LOCAL_STORAGE_KEY, repo.trim());
    }
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Get current application info (versionName, versionCode, packageName).
 */
export async function getAppInfo(): Promise<AppInfo> {
  if (Capacitor.isNativePlatform()) {
    try {
      return await AppUpdater.getAppInfo();
    } catch (err) {
      console.warn('AppUpdater.getAppInfo failed, falling back:', err);
    }
  }
  return {
    versionName: '1.0',
    versionCode: 1,
    packageName: 'br.com.chacara.inventario',
  };
}

/**
 * Parse a semver string (e.g. "v1.0.2", "1.0", "2.1.0-beta") into integer components.
 */
export function parseSemver(version: string): number[] {
  if (!version) return [0, 0, 0];
  // Remove leading v/V
  let clean = version.trim().replace(/^[vV]/, '');
  // Remove pre-release tags like -beta or +build
  clean = clean.split('-')[0].split('+')[0];
  const parts = clean.split('.').map((p) => {
    const n = parseInt(p, 10);
    return isNaN(n) ? 0 : n;
  });
  while (parts.length < 3) {
    parts.push(0);
  }
  return parts;
}

/**
 * Compare two semver strings. Returns true if remoteVersion > currentVersion.
 */
export function isVersionNewer(remoteVersion: string, currentVersion: string): boolean {
  const remoteParts = parseSemver(remoteVersion);
  const currentParts = parseSemver(currentVersion);

  const maxLen = Math.max(remoteParts.length, currentParts.length);
  for (let i = 0; i < maxLen; i++) {
    const r = remoteParts[i] || 0;
    const c = currentParts[i] || 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
}

/**
 * Check GitHub releases for updates.
 * Fails silently by returning null unless manualCheck is true.
 */
export async function checkForUpdate(manualCheck: boolean = false): Promise<UpdateInfo | null> {
  const repo = getOtaRepo();
  const url = `https://api.github.com/repos/${repo}/releases/latest`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });
    clearTimeout(timeoutId);

    if (response.status === 404) {
      if (manualCheck) {
        throw new Error(
          `Nenhuma release encontrada no repositório "${repo}". Crie uma release com a tag de versão e anexe o APK.`
        );
      }
      return null;
    }

    if (response.status === 403) {
      if (manualCheck) {
        throw new Error(
          'Limite de requisições públicas do GitHub atingido para esta rede. Tente novamente em alguns minutos.'
        );
      }
      return null;
    }

    if (!response.ok) {
      if (manualCheck) {
        throw new Error(`Erro na API do GitHub (Status: ${response.status}).`);
      }
      return null;
    }

    const release = await response.json();
    const remoteTag = release.tag_name || '';
    if (!remoteTag) {
      if (manualCheck) {
        throw new Error('A release mais recente do GitHub não possui tag_name válida.');
      }
      return null;
    }

    const appInfo = await getAppInfo();
    const currentVersion = appInfo.versionName;
    const hasUpdate = isVersionNewer(remoteTag, currentVersion);

    // Look for .apk asset
    const apkAsset = release.assets?.find(
      (asset: any) =>
        asset.name?.toLowerCase().endsWith('.apk') ||
        asset.content_type === 'application/vnd.android.package-archive'
    );

    return {
      hasUpdate,
      currentVersion,
      remoteVersion: remoteTag.replace(/^[vV]/, ''),
      releaseTitle: release.name || remoteTag,
      releaseNotes: release.body || '',
      publishedAt: release.published_at || '',
      apkUrl: apkAsset?.browser_download_url || null,
      apkName: apkAsset?.name || null,
      apkSize: apkAsset?.size || null,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (manualCheck) {
      throw err;
    }
    // Fail silently in background without disturbing user
    return null;
  }
}

/**
 * Check if the app has permission to install unknown apps (Android 8+).
 */
export async function canRequestPackageInstalls(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const res = await AppUpdater.canRequestPackageInstalls();
    return Boolean(res.canInstall);
  } catch (err) {
    console.warn('canRequestPackageInstalls failed:', err);
    return true;
  }
}

/**
 * Direct user to Android system settings to allow installing apps from this source.
 */
export async function openInstallSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await AppUpdater.openInstallSettings();
}

/**
 * Download APK file from URL with real-time progress callback.
 */
export async function downloadApk(
  url: string,
  fileName: string = 'update.apk',
  onProgress?: (progress: DownloadProgress) => void
): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    // If running in browser simulation, wait 1.5s with progress
    if (onProgress) {
      for (let p = 10; p <= 100; p += 20) {
        await new Promise((r) => setTimeout(r, 200));
        onProgress({ percent: p, bytes: p * 100000, total: 10000000 });
      }
    }
    return '/simulated/update.apk';
  }

  let listenerHandle: { remove: () => Promise<void> } | null = null;
  if (onProgress) {
    listenerHandle = await AppUpdater.addListener('downloadProgress', onProgress);
  }

  try {
    const result = await AppUpdater.downloadUpdate({ url, fileName });
    return result.filePath;
  } finally {
    if (listenerHandle) {
      await listenerHandle.remove();
    }
  }
}

/**
 * Trigger native Android installer Intent for downloaded APK file.
 */
export async function installApk(
  filePath: string
): Promise<{ success: boolean; needPermission?: boolean }> {
  if (!Capacitor.isNativePlatform()) {
    return { success: true, needPermission: false };
  }
  return await AppUpdater.installApk({ filePath });
}
