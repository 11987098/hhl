using SignalServer.Hubs;

var builder = WebApplication.CreateBuilder(args);

// ===== 关键：配置反向代理（CloudBase 网关必须）=====
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.All;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

// SignalR 配置
builder.Services.AddSignalR(options =>
{
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
    options.MaximumReceiveMessageSize = 64 * 1024;
    options.EnableDetailedErrors = true;
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

builder.Services.AddHealthChecks();

var app = builder.Build();

// ===== 关键：必须放在最前面，先处理代理头 =====
app.UseForwardedHeaders();

app.UseCors("AllowAll");
app.UseWebSockets();  // 显式启用 WebSocket

app.MapHealthChecks("/health");
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapHub<SignalHub>("/signalhub");
app.MapFallbackToFile("index.html");

app.Run();
