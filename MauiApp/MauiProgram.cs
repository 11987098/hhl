using MauiScreenShare;
using MauiScreenShare.Platforms.Android;
using Microsoft.Maui.Controls.Hosting;
using Microsoft.Maui.Hosting;

namespace MauiScreenShare;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder
            .UseMauiApp<App>()
            // 注册自定义 WebView Handler
            .ConfigureMauiHandlers(handlers =>
            {
                handlers.AddHandler(typeof(MediaWebView), typeof(MediaWebViewHandler));
            });

        return builder.Build();
    }
}
