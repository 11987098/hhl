namespace MauiScreenShare;

/// <summary>
/// 自定义 WebView，用于在 Android 平台上启用媒体权限（麦克风、屏幕捕获）
/// </summary>
public class MediaWebView : WebView
{
    public static readonly BindableProperty CanGoBackProperty =
        BindableProperty.Create(nameof(CanGoBack), typeof(bool), typeof(MediaWebView), false);

    public bool CanGoBack
    {
        get => (bool)GetValue(CanGoBackProperty);
        set => SetValue(CanGoBackProperty, value);
    }
}
