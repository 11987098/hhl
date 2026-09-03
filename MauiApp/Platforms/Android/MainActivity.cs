using Android.App;
using Android.Content.PM;
using Android.OS;
using Android.Webkit;

namespace MauiScreenShare.Platforms.Android;

[Activity(Theme = "@style/Maui.SplashTheme",
          MainLauncher = true,
          ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation |
                                 ConfigChanges.UiMode | ConfigChanges.ScreenLayout |
                                 ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
public class MainActivity : MauiAppCompatActivity
{
    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);

        // 允许混合内容（HTTP 资源在 HTTPS 页面中加载）
        Android.Webkit.WebView.SetWebContentsDebuggingEnabled(true);
    }

    // 运行时权限请求结果（麦克风等）
    public override void OnRequestPermissionsResult(int requestCode, string[] permissions, Permission[] grantResults)
    {
        Platform.OnRequestPermissionsResult(requestCode, permissions, grantResults);
        base.OnRequestPermissionsResult(requestCode, permissions, grantResults);
    }
}
