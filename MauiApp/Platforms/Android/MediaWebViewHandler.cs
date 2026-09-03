using Android.Webkit;
using Microsoft.Maui.Handlers;
using Microsoft.Maui.Platform;
using MauiScreenShare;
using AWebView = Android.Webkit.WebView;

namespace MauiScreenShare.Platforms.Android;

/// <summary>
/// 自定义 WebView Handler：启用 JavaScript / DOM 存储 / 媒体权限，
/// 处理麦克风和屏幕捕获的权限请求回调。
/// 
/// 注意：Android WebView 对 getDisplayMedia（屏幕共享）支持有限，
/// 建议使用 Chrome 浏览器获得完整体验；麦克风语音通话在 WebView 中可正常工作。
/// </summary>
public class MediaWebViewHandler : WebViewHandler
{
    protected override AWebView CreatePlatformView()
    {
        var webView = base.CreatePlatformView();

        var settings = webView.Settings;
        settings.JavaScriptEnabled = true;
        settings.DomStorageEnabled = true;
        settings.MediaPlaybackRequiresUserGesture = false;  // 允许自动播放音频/视频
        settings.AllowFileAccess = true;
        settings.AllowContentAccess = true;
        settings.MixedContentMode = MixedContentHandling.AlwaysAllow;
        settings.CacheMode = CacheModes.NoCache;

        // 自定义 WebChromeClient 处理权限请求
        webView.SetWebChromeClient(new MediaWebChromeClient());

        // 自定义 WebViewClient
        webView.SetWebViewClient(new WebViewClient());

        return webView;
    }
}

/// <summary>
/// 处理 WebView 中的媒体权限请求（麦克风、摄像头、屏幕捕获）
/// </summary>
public class MediaWebChromeClient : WebChromeClient
{
    public override void OnPermissionRequest(PermissionRequest? request)
    {
        if (request == null) return;

        // 自动授予所有请求的权限（麦克风、音频、视频捕获、屏幕捕获）
        // 生产环境建议在此处添加用户确认弹窗
        request.Grant(request.GetResources());
    }

    public override void OnPermissionRequestCanceled(PermissionRequest? request)
    {
        base.OnPermissionRequestCanceled(request);
    }
}
