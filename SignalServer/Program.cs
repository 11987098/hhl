using SignalServer.Hubs;

var builder = WebApplication.CreateBuilder(args);

// ===== 关键：配置反向代理（CloudBase 网关必须）=====
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.All;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

// SignalR 配置（优化扣费核心：缩短超时，快速清理僵尸连接）
builder.Services.AddSignalR(options =>
{
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);       // 保活心跳从15秒改10秒，更快探测死连接
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(25);  // 客户端超时从30秒改20秒，无心跳直接强制断开WS
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

