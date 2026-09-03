namespace MauiScreenShare;

public partial class MainPage : ContentPage
{
    public MainPage()
    {
        InitializeComponent();
    }

    protected override bool OnBackButtonPressed()
    {
        // 网页内返回上一页
        if (webView.IsLoaded && webView.CanGoBack)
        {
            webView.GoBack();
            return true;
        }
        return base.OnBackButtonPressed();
    }
}
