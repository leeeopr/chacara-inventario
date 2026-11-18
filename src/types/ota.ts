export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  remoteVersion: string;
  releaseTitle: string;
  releaseNotes: string;
  publishedAt: string;
  apkUrl: string | null;
  apkName: string | null;
  apkSize: number | null;
}

export interface DownloadProgress {
  percent: number;
  bytes: number;
  total: number;
}

export interface AppInfo {
  versionName: string;
  versionCode: number;
  packageName: string;
}

export interface AppUpdaterPluginInterface {
  getAppInfo(): Promise<AppInfo>;
  canRequestPackageInstalls(): Promise<{ canInstall: boolean }>;
  openInstallSettings(): Promise<{ success: boolean }>;
  downloadUpdate(options: { url: string; fileName?: string }): Promise<{
    filePath: string;
    fileSize?: number;
  }>;
  installApk(options: { filePath: string }): Promise<{
    success: boolean;
    needPermission?: boolean;
  }>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (progress: DownloadProgress) => void
  ): Promise<{ remove: () => Promise<void> }>;
  removeAllListeners(): Promise<void>;
}
