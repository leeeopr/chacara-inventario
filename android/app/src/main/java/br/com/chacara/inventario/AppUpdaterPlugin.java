package br.com.chacara.inventario;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String TAG = "AppUpdaterPlugin";

    @SuppressWarnings("deprecation")
    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            Context context = getContext();
            PackageManager pm = context.getPackageManager();
            PackageInfo pInfo = pm.getPackageInfo(context.getPackageName(), 0);

            JSObject ret = new JSObject();
            ret.put("versionName", pInfo.versionName != null ? pInfo.versionName : BuildConfig.VERSION_NAME);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pInfo.getLongVersionCode() : pInfo.versionCode;
            ret.put("versionCode", versionCode);
            ret.put("packageName", context.getPackageName());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error getting app info", e);
            JSObject ret = new JSObject();
            ret.put("versionName", BuildConfig.VERSION_NAME);
            ret.put("versionCode", BuildConfig.VERSION_CODE);
            ret.put("packageName", getContext().getPackageName());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void canRequestPackageInstalls(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            boolean canInstall = getContext().getPackageManager().canRequestPackageInstalls();
            ret.put("canInstall", canInstall);
        } else {
            ret.put("canInstall", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Context context = getContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error opening install settings", e);
            call.reject("Erro ao abrir configurações: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        String downloadUrl = call.getString("url");
        if (downloadUrl == null || downloadUrl.trim().isEmpty()) {
            call.reject("URL de download inválida");
            return;
        }

        String rawFileName = call.getString("fileName", "update.apk");
        final String fileName = (rawFileName.endsWith(".apk")) ? rawFileName : (rawFileName + ".apk");

        new Thread(() -> {
            HttpURLConnection connection = null;
            InputStream input = null;
            FileOutputStream output = null;

            try {
                Context context = getContext();
                // Prefer external files dir (Download) so package installer can read easily
                File updateDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (updateDir == null) {
                    updateDir = new File(context.getCacheDir(), "updates");
                }
                if (!updateDir.exists()) {
                    updateDir.mkdirs();
                }

                // Cleanup older apk files
                File[] oldFiles = updateDir.listFiles();
                if (oldFiles != null) {
                    for (File f : oldFiles) {
                        if (f.getName().endsWith(".apk")) {
                            f.delete();
                        }
                    }
                }

                File targetFile = new File(updateDir, fileName);
                if (targetFile.exists()) {
                    targetFile.delete();
                }

                URL url = new URL(downloadUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "Chacara-Inventario-OTA");
                connection.setConnectTimeout(30000);
                connection.setReadTimeout(30000);
                connection.connect();

                // Handle HTTP redirects (GitHub releases assets redirect to AWS S3/Azure Blob)
                int responseCode = connection.getResponseCode();
                int redirectCount = 0;
                while ((responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                        responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                        responseCode == HttpURLConnection.HTTP_SEE_OTHER ||
                        responseCode == 307 || responseCode == 308) && redirectCount < 5) {
                    String redirectUrl = connection.getHeaderField("Location");
                    connection.disconnect();
                    url = new URL(url, redirectUrl);
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setInstanceFollowRedirects(true);
                    connection.setRequestProperty("User-Agent", "Chacara-Inventario-OTA");
                    connection.setConnectTimeout(30000);
                    connection.setReadTimeout(30000);
                    connection.connect();
                    responseCode = connection.getResponseCode();
                    redirectCount++;
                }

                if (responseCode < 200 || responseCode >= 300) {
                    call.reject("Falha no download. Código de resposta: " + responseCode);
                    return;
                }

                int fileLength = connection.getContentLength();
                input = connection.getInputStream();
                output = new FileOutputStream(targetFile);

                byte[] data = new byte[8192];
                long total = 0;
                int count;
                long lastNotifyTime = 0;

                while ((count = input.read(data)) != -1) {
                    total += count;
                    output.write(data, 0, count);

                    long now = System.currentTimeMillis();
                    if (fileLength > 0 && (now - lastNotifyTime > 150 || total == fileLength)) {
                        lastNotifyTime = now;
                        int percent = (int) ((total * 100) / fileLength);
                        JSObject progress = new JSObject();
                        progress.put("percent", percent);
                        progress.put("bytes", total);
                        progress.put("total", fileLength);
                        notifyListeners("downloadProgress", progress);
                    }
                }

                output.flush();
                targetFile.setReadable(true, false);

                JSObject progress = new JSObject();
                progress.put("percent", 100);
                progress.put("bytes", total);
                progress.put("total", fileLength > 0 ? fileLength : total);
                notifyListeners("downloadProgress", progress);

                JSObject result = new JSObject();
                result.put("filePath", targetFile.getAbsolutePath());
                result.put("fileSize", targetFile.length());
                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "Error downloading update", e);
                call.reject("Erro no download: " + e.getMessage());
            } finally {
                try {
                    if (output != null) output.close();
                    if (input != null) input.close();
                    if (connection != null) connection.disconnect();
                } catch (Exception ignored) {}
            }
        }).start();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.trim().isEmpty()) {
            call.reject("Caminho do arquivo não fornecido");
            return;
        }

        try {
            Context context = getContext();
            File apkFile = new File(filePath);
            if (!apkFile.exists()) {
                call.reject("Arquivo APK não encontrado em: " + filePath);
                return;
            }

            // Ensure world-readable permissions
            apkFile.setReadable(true, false);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!context.getPackageManager().canRequestPackageInstalls()) {
                    Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    settingsIntent.setData(Uri.parse("package:" + context.getPackageName()));
                    settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(settingsIntent);

                    JSObject ret = new JSObject();
                    ret.put("success", false);
                    ret.put("needPermission", true);
                    call.resolve(ret);
                    return;
                }
            }

            Uri apkUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                apkFile
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.setClipData(ClipData.newRawUri("", apkUri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);

            List<ResolveInfo> resInfoList = context.getPackageManager().queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
            for (ResolveInfo resolveInfo : resInfoList) {
                String packageName = resolveInfo.activityInfo.packageName;
                context.grantUriPermission(packageName, apkUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }

            context.startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("needPermission", false);
            call.resolve(ret);

        } catch (Exception e) {
            Log.e(TAG, "Error installing APK", e);
            call.reject("Falha ao abrir instalador do APK: " + e.getMessage());
        }
    }
}
